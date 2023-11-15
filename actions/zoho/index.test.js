import { getStudioAccounts, getZohoAccountFromAccounts, refreshAndFetchUpdatedAccount } from './account';
import { isAccessTokenExpired } from './utils';

jest.mock('./account', () => ({
    getStudioAccounts: jest.fn(),
    getZohoAccountFromAccounts: jest.fn(),
    refreshAndFetchUpdatedAccount: jest.fn(),
}));

jest.mock('./utils', () => ({
    isAccessTokenExpired: jest.fn(),
}));

import { getZohoAccount } from './index';

describe('getZohoAccount', () => {
    it('returns the Zoho account if the access token is not expired', async () => {
        const account = { platform: 'zoho', accessToken: 'access_token' };
        getStudioAccounts.mockResolvedValue([{ Account: account }]);
        getZohoAccountFromAccounts.mockReturnValue(account);
        isAccessTokenExpired.mockReturnValue(false);
        const result = await getZohoAccount({ studioId: 'studioId' });
        expect(result).toEqual(account);
    });

    it('returns the updated Zoho account if the access token is expired', async () => {
        const account = { platform: 'zoho', accessToken: 'access_token' };
        const newAccessToken = 'new_access_token';
        getStudioAccounts.mockResolvedValue([{ Account: account }]);
        getZohoAccountFromAccounts.mockReturnValue(account);
        isAccessTokenExpired.mockReturnValue(true);
        refreshAndFetchUpdatedAccount.mockResolvedValue({ ...account, accessToken: newAccessToken });
        const result = await getZohoAccount({ studioId: 'studioId' });
        expect(result.accessToken).toEqual(newAccessToken);
    });
});