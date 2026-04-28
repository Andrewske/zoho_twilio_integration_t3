jest.mock('~/utils/prisma', () => ({
  prisma: {
    studioAccount: {
      findMany: jest.fn(),
    },
  },
}));

const refreshAccessTokenMock = jest.fn();
jest.mock('../actions/zoho/token/index.js', () => ({
  refreshAccessToken: (...args) => refreshAccessTokenMock(...args),
}));

import { prisma } from '~/utils/prisma';
import { AccountManager } from './accountManager.js';

const studioId = 'studio-1';

const mkAccount = (id, opts = {}) => ({
  id,
  platform: 'zoho',
  refreshToken: `r-${id}`,
  clientId: `c-${id}`,
  clientSecret: `s-${id}`,
  accessToken: `at-${id}`,
  expiresIn: 3600,
  updatedAt: new Date(),
  lastRefreshAt: opts.lastRefreshAt ?? new Date(),
  lastRefreshError: opts.lastRefreshError ?? null,
  lastRefreshErrorAt: opts.lastRefreshErrorAt ?? null,
});

const mkStudioAccountRow = (account) => ({ studioId, accountId: account.id, Account: account });

describe('listStudioAccountsByPlatform sort order', () => {
  beforeEach(() => jest.clearAllMocks());

  test('healthy accounts come before failed accounts', async () => {
    const broken = mkAccount('broken', { lastRefreshErrorAt: new Date(), lastRefreshError: 'invalid_client' });
    const healthy = mkAccount('healthy');
    prisma.studioAccount.findMany.mockResolvedValue([
      mkStudioAccountRow(broken),
      mkStudioAccountRow(healthy),
    ]);

    const sorted = await AccountManager.listStudioAccountsByPlatform(studioId, 'zoho');
    expect(sorted.map(a => a.id)).toEqual(['healthy', 'broken']);
  });

  test('among healthy accounts, most-recently-refreshed wins', async () => {
    const older = mkAccount('older', { lastRefreshAt: new Date(Date.now() - 86_400_000) });
    const newer = mkAccount('newer', { lastRefreshAt: new Date() });
    prisma.studioAccount.findMany.mockResolvedValue([
      mkStudioAccountRow(older),
      mkStudioAccountRow(newer),
    ]);

    const sorted = await AccountManager.listStudioAccountsByPlatform(studioId, 'zoho');
    expect(sorted.map(a => a.id)).toEqual(['newer', 'older']);
  });
});

describe('getAccountByPlatform', () => {
  beforeEach(() => jest.clearAllMocks());

  test('throws NOT_FOUND when all candidates are excluded', async () => {
    prisma.studioAccount.findMany.mockResolvedValue([
      mkStudioAccountRow(mkAccount('a')),
    ]);
    await expect(
      AccountManager.getAccountByPlatform(studioId, 'zoho', new Set(['a']))
    ).rejects.toThrow(/No usable zoho account/);
  });

  test('returns the first non-excluded candidate', async () => {
    const a = mkAccount('a');
    const b = mkAccount('b');
    prisma.studioAccount.findMany.mockResolvedValue([
      mkStudioAccountRow(a),
      mkStudioAccountRow(b),
    ]);
    const result = await AccountManager.getAccountByPlatform(studioId, 'zoho', new Set(['a']));
    expect(result.id).toBe('b');
  });
});

describe('getZohoAccount fallback behavior', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the first healthy account when not expired', async () => {
    const fresh = mkAccount('fresh');
    prisma.studioAccount.findMany.mockResolvedValue([mkStudioAccountRow(fresh)]);

    const result = await AccountManager.getZohoAccount(studioId);
    expect(result.id).toBe('fresh');
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  test('falls back from a refresh-throwing account to the next candidate', async () => {
    // Both expired (lastRefreshAt far in the past) so both will refresh.
    const broken = mkAccount('broken', { lastRefreshAt: new Date(0), expiresIn: 1 });
    const working = mkAccount('working', { lastRefreshAt: new Date(0), expiresIn: 1 });
    prisma.studioAccount.findMany.mockResolvedValue([
      mkStudioAccountRow(broken),
      mkStudioAccountRow(working),
    ]);

    refreshAccessTokenMock
      .mockRejectedValueOnce(new Error('Token refresh failed for account broken'))
      .mockResolvedValueOnce({ ...working, accessToken: 'new-at' });

    const result = await AccountManager.getZohoAccount(studioId);
    expect(result.id).toBe('working');
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(2);
  });

  test('throws AUTHENTICATION when ALL candidates fail', async () => {
    const a = mkAccount('a', { lastRefreshAt: new Date(0), expiresIn: 1 });
    const b = mkAccount('b', { lastRefreshAt: new Date(0), expiresIn: 1 });
    prisma.studioAccount.findMany.mockResolvedValue([
      mkStudioAccountRow(a),
      mkStudioAccountRow(b),
    ]);
    refreshAccessTokenMock.mockRejectedValue(new Error('invalid_client'));

    await expect(AccountManager.getZohoAccount(studioId)).rejects.toThrow(
      /All zoho accounts failed/
    );
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(2);
  });

  test('throws NOT_FOUND when studio has no zoho accounts at all', async () => {
    prisma.studioAccount.findMany.mockResolvedValue([]);
    await expect(AccountManager.getZohoAccount(studioId)).rejects.toThrow(
      /No zoho account found/
    );
  });
});

describe('isAccessTokenExpired', () => {
  test('uses lastRefreshAt over updatedAt (so failure-marker writes do not look like refreshes)', async () => {
    // updatedAt is "now" (just got bumped by markAccountFailure), but
    // lastRefreshAt is old. Account should still be considered expired.
    const account = {
      lastRefreshAt: new Date(Date.now() - 7200_000), // 2h ago
      updatedAt: new Date(),                          // 0s ago (failure write)
      expiresIn: 3600,                                 // 1h validity
    };
    expect(AccountManager.isAccessTokenExpired(account)).toBe(true);
  });

  test('falls back to updatedAt for legacy rows without lastRefreshAt', async () => {
    const fresh = { lastRefreshAt: null, updatedAt: new Date(), expiresIn: 3600 };
    expect(AccountManager.isAccessTokenExpired(fresh)).toBe(false);
  });

  test('returns true when missing required fields', async () => {
    expect(AccountManager.isAccessTokenExpired({})).toBe(true);
    expect(AccountManager.isAccessTokenExpired(null)).toBe(true);
  });
});
