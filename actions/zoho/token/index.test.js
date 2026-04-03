import { buildParams, buildUrl, updateAccount, refreshAccessToken } from './index';

jest.mock('~/utils/prisma.js', () => ({
  prisma: {
    account: {
      update: jest.fn(),
    },
  },
}));

import { prisma } from '~/utils/prisma.js';

describe('Zoho token tests', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('buildParams creates correct parameters', () => {
    const params = buildParams({
      refreshToken: 'refreshToken',
      clientId: 'clientId',
      clientSecret: 'clientSecret',
    });
    expect(params.toString()).toBe(
      'refresh_token=refreshToken&client_id=clientId&client_secret=clientSecret&grant_type=refresh_token'
    );
  });

  test('buildUrl creates correct url', () => {
    const url = buildUrl(new URLSearchParams('test=test'));
    expect(url).toBe('https://accounts.zoho.com/oauth/v2/token?test=test');
  });

  test('updateAccount updates account correctly', async () => {
    const updated = { id: 1, accessToken: 'access_token', expiresIn: 3600 };
    prisma.account.update.mockResolvedValue(updated);

    const result = await updateAccount({ id: 1, access_token: 'access_token', expires_in: 3600 });

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { accessToken: 'access_token', expiresIn: 3600 },
    });
    expect(result).toEqual(updated);
  });

  test('refreshAccessToken refreshes access token correctly', async () => {
    const updated = { id: 1, accessToken: 'new_access_token', expiresIn: 3600 };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
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
});
