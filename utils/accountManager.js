/**
 * Account management utilities
 * Centralizes account retrieval logic for different platforms
 */

import { prisma } from './prisma.js';
import { withAccountErrorHandling, createTypedError, ErrorTypes } from './errorHandling.js';

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
  async getAccountByPlatform(studioId, platform) {
    const studioAccounts = await prisma.studioAccount.findMany({
      where: { studioId },
      include: { Account: true }
    });

    const account = studioAccounts
      .map(sa => sa.Account)
      .find(account => account.platform === platform);

    if (!account) {
      throw createTypedError(
        ErrorTypes.NOT_FOUND,
        `No ${platform} account found for studio ${studioId}`,
        { studioId, platform }
      );
    }

    return account;
  },

  /**
   * Get Zoho account for a studio with token refresh handling
   * @param {string} studioId - Studio ID
   * @returns {Promise<Object>} Zoho account with valid access token
   */
  async getZohoAccount(studioId) {
    const account = await this.getAccountByPlatform(studioId, 'zoho');
    
    // Check if access token is expired and refresh if needed
    if (this.isAccessTokenExpired(account)) {
      console.log('Access token is expired, refreshing...');
      // Import refreshAccessToken here to avoid circular dependencies
      const { refreshAccessToken } = await import('../actions/zoho/token/index.js');
      return await refreshAccessToken(account);
    }
    
    return account;
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
    if (!account?.updatedAt || !account?.expiresIn) {
      return true; // Consider expired if missing required fields
    }

    const { updatedAt, expiresIn } = account;
    const updatedAtDate = new Date(updatedAt);
    updatedAtDate.setTime(updatedAtDate.getTime() + expiresIn * 1000);
    return updatedAtDate < new Date(Date.now());
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