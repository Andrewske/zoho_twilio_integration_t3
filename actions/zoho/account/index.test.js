
import { getStudioAccounts, getZohoAccountFromAccounts, refreshAndFetchUpdatedAccount } from './index';

jest.mock('~/utils/prisma.js', () => ({
    studioAccount: {
        findMany: jest.fn(),
    },
}));


jest.mock('~/actions/zoho/token', () => ({
    refreshAccessToken: jest.fn(),
}));

import prisma from '~/utils/prisma.js';
import { refreshAccessToken } from '~/actions/zoho/token';


describe('getStudioAccounts', () => {
    it('throws an error if studioId is not provided', async () => {
        await expect(getStudioAccounts({})).rejects.toThrow('Studio ID is required');
    });

    it('fetches studio accounts from the database', async () => {
        const studioAccounts = [{ Account: { platform: 'zoho', accessToken: 'access_token' } }];
        prisma.studioAccount.findMany.mockResolvedValue(studioAccounts);
        const result = await getStudioAccounts({ studioId: 'studioId' });
        expect(result).toEqual(studioAccounts);
    });
});

describe('getZohoAccountFromAccounts', () => {
    it('throws an error if no Zoho account is found', () => {
        const studioAccounts = [{ Account: { platform: 'not-zoho' } }];
        expect(() => getZohoAccountFromAccounts(studioAccounts)).toThrow('No Zoho account found for studio');
    });

    it('returns the Zoho account', () => {
        const zohoAccount = { platform: 'zoho' };
        const studioAccounts = [{ Account: zohoAccount }];
        const result = getZohoAccountFromAccounts(studioAccounts);
        expect(result).toEqual(zohoAccount);
    });
});

describe('refreshAndFetchUpdatedAccount', () => {
    it('refreshes the access token and fetches the updated account', async () => {
        const account = { platform: 'zoho', accessToken: 'access_token' };
        const newAccessToken = 'new_access_token';
        refreshAccessToken.mockResolvedValue(newAccessToken);
        const updatedAccounts = [{ Account: { ...account, accessToken: newAccessToken } }];
        prisma.studioAccount.findMany.mockResolvedValue(updatedAccounts);
        const result = await refreshAndFetchUpdatedAccount(account, 'studioId');
        expect(result.accessToken).toEqual(newAccessToken);
    });
});
