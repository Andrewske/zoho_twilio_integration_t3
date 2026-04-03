jest.mock('~/utils/accountManager', () => ({
    AccountManager: {
        getZohoAccount: jest.fn(),
    }
}));

import { AccountManager } from '~/utils/accountManager';
import { getZohoAccount } from './index';

describe('getZohoAccount', () => {
    it('returns the Zoho account when access token is valid', async () => {
        const account = { platform: 'zoho', accessToken: 'access_token' };
        AccountManager.getZohoAccount.mockResolvedValue(account);
        const result = await getZohoAccount({ studioId: 'studioId' });
        expect(result).toEqual(account);
        expect(AccountManager.getZohoAccount).toHaveBeenCalledWith('studioId');
    });

    it('returns a refreshed account when access token is expired', async () => {
        const refreshedAccount = { platform: 'zoho', accessToken: 'new_access_token' };
        AccountManager.getZohoAccount.mockResolvedValue(refreshedAccount);
        const result = await getZohoAccount({ studioId: 'studioId' });
        expect(result.accessToken).toEqual('new_access_token');
    });
});
