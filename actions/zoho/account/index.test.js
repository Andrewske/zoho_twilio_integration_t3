import { getStudioAccounts, getZohoAccountFromAccounts } from './index';

jest.mock('~/utils/prisma.js', () => ({
    prisma: {
        studioAccount: {
            findMany: jest.fn(),
        },
    },
}));

import { prisma } from '~/utils/prisma.js';


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
    it('returns null if no Zoho account is found', async () => {
        const studioAccounts = [{ Account: { platform: 'not-zoho' } }];
        expect(await getZohoAccountFromAccounts(studioAccounts)).toBeNull();
    });

    it('returns the Zoho account', async () => {
        const zohoAccount = { platform: 'zoho' };
        const studioAccounts = [{ Account: zohoAccount }];
        const result = await getZohoAccountFromAccounts(studioAccounts);
        expect(result).toEqual(zohoAccount);
    });
});
