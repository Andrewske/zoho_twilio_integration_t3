import {
  buildParams,
  buildUrl,
  updateAccount,
  refreshAccessToken,
  markAccountFailure,
} from './index';

jest.mock('~/utils/prisma.js', () => ({
  prisma: {
    account: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('~/utils/notify', () => ({
  notify: jest.fn(),
}));

jest.mock('~/utils/logError', () => ({
  logError: jest.fn(),
}));

import { prisma } from '~/utils/prisma.js';
import { notify } from '~/utils/notify';
import { logError } from '~/utils/logError';

describe('Zoho token tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('buildParams creates correct parameters', async () => {
    const params = await buildParams({
      refreshToken: 'refreshToken',
      clientId: 'clientId',
      clientSecret: 'clientSecret',
    });
    expect(params.toString()).toBe(
      'refresh_token=refreshToken&client_id=clientId&client_secret=clientSecret&grant_type=refresh_token'
    );
  });

  test('buildUrl creates correct url', async () => {
    const url = await buildUrl(new URLSearchParams('test=test'));
    expect(url).toBe('https://accounts.zoho.com/oauth/v2/token?test=test');
  });

  test('updateAccount writes accessToken/expiresIn AND clears error fields + bumps lastRefreshAt', async () => {
    const updated = { id: 1, accessToken: 'access_token', expiresIn: 3600 };
    prisma.account.update.mockResolvedValue(updated);

    const result = await updateAccount({ id: 1, access_token: 'access_token', expires_in: 3600 });

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        accessToken: 'access_token',
        expiresIn: 3600,
        lastRefreshError: null,
        lastRefreshErrorAt: null,
        lastRefreshAt: expect.any(Date),
      }),
    });
    expect(result).toEqual(updated);
  });

  test('refreshAccessToken happy path returns updated account', async () => {
    const updated = { id: 1, accessToken: 'new_access_token', expiresIn: 3600 };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ access_token: 'new_access_token', expires_in: 3600 }),
    });
    prisma.account.update.mockResolvedValue(updated);

    const result = await refreshAccessToken({
      id: 1,
      refreshToken: 'refreshToken',
      clientId: 'clientId',
      clientSecret: 'clientSecret',
    });

    expect(result).toEqual(updated);
  });

  // CRITICAL REGRESSION TEST. Zoho returns HTTP 200 with {error: '...'} for
  // invalid_client / revoked refresh tokens. The original code only checked
  // response.ok and treated this as success, then threw a vague downstream
  // error that lookupContact swallowed → 14 days of silent mis-routing in prod.
  // Without this test the fix can be reverted and we won't notice.
  test('refreshAccessToken throws when HTTP 200 carries an error body (invalid_client)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ error: 'invalid_client' }),
    });
    prisma.account.findUnique.mockResolvedValue({ lastRefreshError: null });
    prisma.account.update.mockResolvedValue({});

    await expect(
      refreshAccessToken({
        id: 'acc-1',
        refreshToken: 'r',
        clientId: 'c',
        clientSecret: 's',
      })
    ).rejects.toThrow(/invalid_client/);

    // markAccountFailure must persist the failure on the Account row so the
    // health-aware picker can avoid this account on the next call.
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        lastRefreshError: 'invalid_client',
        lastRefreshErrorAt: expect.any(Date),
      }),
    });
  });

  test('refreshAccessToken throws on non-ok HTTP and marks failure with HTTP code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({}),
    });
    prisma.account.findUnique.mockResolvedValue({ lastRefreshError: null });
    prisma.account.update.mockResolvedValue({});

    await expect(
      refreshAccessToken({ id: 'acc-2', refreshToken: 'r', clientId: 'c', clientSecret: 's' })
    ).rejects.toThrow(/HTTP 500/);

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-2' },
      data: expect.objectContaining({ lastRefreshError: 'HTTP 500' }),
    });
  });

  test('refreshAccessToken throws and marks failure when network throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    prisma.account.findUnique.mockResolvedValue({ lastRefreshError: null });
    prisma.account.update.mockResolvedValue({});

    await expect(
      refreshAccessToken({ id: 'acc-3', refreshToken: 'r', clientId: 'c', clientSecret: 's' })
    ).rejects.toThrow('ECONNREFUSED');

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-3' },
      data: expect.objectContaining({
        lastRefreshError: expect.stringContaining('network: ECONNREFUSED'),
      }),
    });
  });

  test('markAccountFailure notifies on first failure (state transition)', async () => {
    prisma.account.findUnique.mockResolvedValue({ lastRefreshError: null });
    prisma.account.update.mockResolvedValue({});

    await markAccountFailure('acc-x', 'invalid_client');

    expect(notify).toHaveBeenCalledWith({
      type: 'ZOHO_REFRESH_FAILED',
      data: { accountId: 'acc-x', reason: 'invalid_client' },
    });
  });

  test('markAccountFailure does NOT notify when account was already in error state', async () => {
    prisma.account.findUnique.mockResolvedValue({ lastRefreshError: 'invalid_client' });
    prisma.account.update.mockResolvedValue({});

    await markAccountFailure('acc-x', 'invalid_client');

    expect(notify).not.toHaveBeenCalled();
  });

  test('markAccountFailure swallows DB-write errors so the original Zoho error is not shadowed', async () => {
    prisma.account.findUnique.mockRejectedValue(new Error('db down'));
    prisma.account.update.mockResolvedValue({});

    await expect(markAccountFailure('acc-x', 'invalid_client')).resolves.not.toThrow();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('markAccountFailure') })
    );
  });
});
