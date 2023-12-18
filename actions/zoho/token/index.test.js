import {
  buildParams,
  buildUrl,
  updateAccount,
  refreshAccessToken,
} from './index'; // replace 'yourFile' with the actual file name
import axios from 'axios';
import prisma from '~/utils/prisma';

jest.mock('axios');
jest.mock('@prisma/client', () => ({
  account: {
    update: jest.fn(),
  },
}));

describe('Zoho token tests', () => {
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
    const mockUpdate = jest.fn();
    prisma.account.update = mockUpdate;
    await updateAccount(prisma, {
      id: 1,
      access_token: 'access_token',
      expires_in: 3600,
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        accessToken: 'access_token',
        expiresIn: 3600,
      },
    });
  });

  test('refreshAccessToken refreshes access token correctly', async () => {
    axios.post.mockResolvedValue({
      data: {
        access_token: 'access_token',
        expires_in: 3600,
      },
    });
    const mockUpdate = jest.fn();
    prisma.account.update = mockUpdate;
    const accessToken = await refreshAccessToken(axios, prisma, {
      id: 1,
      refreshToken: 'refreshToken',
      clientId: 'clientId',
      clientSecret: 'clientSecret',
    });
    expect(accessToken).toBe('access_token');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        accessToken: 'access_token',
        expiresIn: 3600,
      },
    });
  });
});
