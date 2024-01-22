'use server';
import { logError } from '~/utils/logError';
import {
  getStudioAccounts,
  getZohoAccountFromAccounts,
  refreshAndFetchUpdatedAccount,
} from './account';
import { isAccessTokenExpired } from './utils';

export const getZohoAccount = async ({ studioId }) => {
  try {
    const studioAccounts = await getStudioAccounts({ studioId });
    const account = getZohoAccountFromAccounts(studioAccounts);

    console.log({ account });
    // Check if the access token is expired
    if (isAccessTokenExpired(account)) {
      console.log('Access token is expired, refreshing...');
      return await refreshAndFetchUpdatedAccount(account, studioId);
    }

    // const { updatedAt, expiresIn } = account;
    // console.log({ updatedAt });
    // const updatedAtDate = new Date(updatedAt);
    // updatedAtDate.setUTCSeconds(updatedAtDate.getUTCSeconds() + expiresIn);
    // console.log({ updatedAt, now: new Date(Date.now()) });
    // console.log(updatedAtDate < new Date(Date.now()));

    console.log('Access token is valid');

    return account;
  } catch (error) {
    console.error(error);
    logError({
      message: 'Error getting Zoho account',
      error,
      data: { studioId },
    });
    return null;
  }
};
