/**
 * Account management utilities
 * Centralizes account retrieval logic for different platforms
 */

import { prisma } from './prisma';
import { withAccountErrorHandling, createTypedError, ErrorTypes } from './errorHandling';

/**
 * Account management utilities for different platforms
 */
export const AccountManager = {
  /**
   * Get account by platform for a specific studio
   * @param {string} studioId - Studio ID
   * @param {string} platform - Platform name ('zoho', 'twilio', etc.)
   * @returns {Promise<Object|null>} Account object or null if not found
   */
  // List a studio's accounts for a platform, sorted by health.
  // 1. Healthy (no recent refresh error) first.
  // 2. Most-recently-refreshed (lastRefreshAt only bumps on success).
  async listStudioAccountsByPlatform(studioId, platform) {
    const studioAccounts = await prisma.studioAccount.findMany({
      where: { studioId, Account: { platform } },
      include: { Account: true },
    });
    return studioAccounts
      .map(sa => sa.Account)
      .sort((a, b) => {
        const aErr = a.lastRefreshErrorAt ? 1 : 0;
        const bErr = b.lastRefreshErrorAt ? 1 : 0;
        if (aErr !== bErr) return aErr - bErr;
        const aAt = a.lastRefreshAt ? new Date(a.lastRefreshAt).getTime() : 0;
        const bAt = b.lastRefreshAt ? new Date(b.lastRefreshAt).getTime() : 0;
        return bAt - aAt;
      });
  },

  async getAccountByPlatform(studioId, platform, excludeIds = new Set()) {
    const candidates = (await this.listStudioAccountsByPlatform(studioId, platform))
      .filter(a => !excludeIds.has(a.id));

    if (candidates.length === 0) {
      throw createTypedError(
        ErrorTypes.NOT_FOUND,
        `No usable ${platform} account for studio ${studioId}`,
        { studioId, platform, excluded: [...excludeIds] }
      );
    }
    return candidates[0];
  },

  /**
   * Get Zoho account for a studio with token refresh handling.
   * If the first candidate's refresh fails, fall through to the next
   * candidate. Throws AUTHENTICATION when all candidates have been tried.
   */
  async getZohoAccount(studioId) {
    const all = await this.listStudioAccountsByPlatform(studioId, 'zoho');
    if (all.length === 0) {
      throw createTypedError(
        ErrorTypes.NOT_FOUND,
        `No zoho account found for studio ${studioId}`,
        { studioId, platform: 'zoho' }
      );
    }

    let lastErr;

    // One attempt per candidate, in health-sorted order. No retry.
    // Reuses the single fetch above — no per-iteration DB roundtrip.
    for (const account of all) {
      try {
        if (this.isAccessTokenExpired(account)) {
          // Import refreshAccessToken here to avoid circular dependencies
          const { refreshAccessToken } = await import('../actions/zoho/token/index.js');
          return await refreshAccessToken(account);
        }
        return account;
      } catch (err) {
        lastErr = err;
        // Loop tries the next candidate.
      }
    }

    throw createTypedError(
      ErrorTypes.AUTHENTICATION,
      `All zoho accounts failed for studio ${studioId}`,
      { studioId, lastError: lastErr?.message }
    );
  },

  /**
   * Get Twilio account for a studio
   * @param {string} studioId - Studio ID
   * @returns {Promise<Object>} Twilio account
   */
  async getTwilioAccount(studioId) {
    return await this.getAccountByPlatform(studioId, 'twilio');
  },

  /**
   * Get all accounts for a studio
   * @param {string} studioId - Studio ID
   * @returns {Promise<Array>} Array of account objects
   */
  async getAllAccounts(studioId) {
    const studioAccounts = await prisma.studioAccount.findMany({
      where: { studioId },
      include: { Account: true }
    });

    return studioAccounts.map(sa => sa.Account);
  },

  /**
   * Get accounts by platform across all studios
   * @param {string} platform - Platform name
   * @returns {Promise<Array>} Array of account objects
   */
  async getAccountsByPlatform(platform) {
    const accounts = await prisma.account.findMany({
      where: { platform },
      include: {
        StudioAccounts: {
          include: {
            Studio: {
              select: {
                id: true,
                name: true,
                active: true
              }
            }
          }
        }
      }
    });

    return accounts;
  },

  /**
   * Check if access token is expired
   * @param {Object} account - Account object with updatedAt and expiresIn
   * @returns {boolean} True if token is expired
   */
  isAccessTokenExpired(account) {
    // Use lastRefreshAt (success-only timestamp) over updatedAt — markAccountFailure
    // also bumps Prisma's @updatedAt, which would otherwise make a freshly-failed
    // account look "fresh" and skip a needed refresh. Fall back to updatedAt for
    // legacy rows that predate the lastRefreshAt column.
    const refreshedAt = account?.lastRefreshAt || account?.updatedAt;
    if (!refreshedAt || !account?.expiresIn) {
      return true; // Consider expired if missing required fields
    }
    const exp = new Date(refreshedAt).getTime() + account.expiresIn * 1000;
    return exp < Date.now();
  },

  /**
   * Check if account has valid credentials
   * @param {Object} account - Account object
   * @param {string} platform - Platform name
   * @returns {boolean} True if account has valid credentials
   */
  hasValidCredentials(account, platform) {
    if (!account) return false;

    switch (platform) {
      case 'zoho':
        return !!(account.accessToken && account.refreshToken);
      case 'twilio':
        return !!(account.clientId && account.clientSecret);
      default:
        return !!(account.clientId && account.clientSecret);
    }
  },

  /**
   * Get active account for platform (first active account found)
   * @param {string} platform - Platform name
   * @returns {Promise<Object|null>} First active account or null
   */
  async getActiveAccount(platform) {
    const accounts = await this.getAccountsByPlatform(platform);
    
    return accounts.find(account => 
      account.StudioAccounts.some(sa => sa.Studio.active) &&
      this.hasValidCredentials(account, platform)
    ) || null;
  },

  /**
   * Validate account configuration for a platform
   * @param {Object} account - Account object
   * @param {string} platform - Platform name
   * @throws {Error} If account configuration is invalid
   * @returns {boolean} True if valid
   */
  validateAccount(account, platform) {
    if (!account) {
      throw createTypedError(
        ErrorTypes.VALIDATION,
        `Account is required for ${platform}`,
        { platform }
      );
    }

    if (!this.hasValidCredentials(account, platform)) {
      throw createTypedError(
        ErrorTypes.VALIDATION,
        `Invalid credentials for ${platform} account`,
        { platform, accountId: account.id }
      );
    }

    if (platform === 'zoho' && this.isAccessTokenExpired(account)) {
      throw createTypedError(
        ErrorTypes.AUTHENTICATION,
        `Access token expired for ${platform} account`,
        { platform, accountId: account.id }
      );
    }

    return true;
  }
};

// Apply error handling to all AccountManager methods
const wrappedMethods = {};
Object.keys(AccountManager).forEach(methodName => {
  if (typeof AccountManager[methodName] === 'function') {
    wrappedMethods[methodName] = withAccountErrorHandling(
      AccountManager[methodName].bind(AccountManager),
      'account_manager'
    );
  } else {
    wrappedMethods[methodName] = AccountManager[methodName];
  }
});

// Export wrapped AccountManager
export const WrappedAccountManager = wrappedMethods;

// Legacy function exports for backward compatibility
export const getZohoAccount = ({ studioId }) => WrappedAccountManager.getZohoAccount(studioId);
export const getTwilioAccount = (studioId) => WrappedAccountManager.getTwilioAccount(studioId);
export const isAccessTokenExpired = (account) => AccountManager.isAccessTokenExpired(account);