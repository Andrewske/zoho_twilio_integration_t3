'use server';
import { getStudioAccounts, getZohoAccountFromAccounts, refreshAndFetchUpdatedAccount } from './account';
import { isAccessTokenExpired } from './utils';


export const getZohoAccount = async ({ studioId }) => {
  try {
    const studioAccounts = await getStudioAccounts({ studioId });
    const account = getZohoAccountFromAccounts(studioAccounts);

    // Check if the access token is expired
    if (isAccessTokenExpired(account)) {
      console.log('Access token is expired, refreshing...');
      return await refreshAndFetchUpdatedAccount(account, studioId);
    }

    return account;
  } catch (error) {
    console.error('Error getting Zoho account:', error);
  }
};

