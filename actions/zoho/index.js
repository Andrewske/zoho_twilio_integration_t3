'use server';
import { logError } from '~/utils/logError';
import {
  getStudioAccounts,
  getZohoAccountFromAccounts
} from './account';
import { refreshAccessToken } from './token';

export const getZohoAccount = async ({ studioId }) => {
  try {
    const studioAccounts = await getStudioAccounts({ studioId });
    let account = await getZohoAccountFromAccounts(studioAccounts);

    // Check if the access token is expired
    if (isAccessTokenExpired(account)) {
      console.log('Access token is expired, refreshing...');
      return await refreshAccessToken(account);
    } else {
      console.log('Access token is not expired, returning account', { account });
    }


    return account;
  } catch (error) {
    console.error(error);
    logError({
      message: 'Error getting Zoho account',
      error,
      data: { studioId },
    });
    throw new Error('Error getting Zoho account');
  }
};


export const isAccessTokenExpired = (account) => {
  const { updatedAt, expiresIn } = account;
  const updatedAtDate = new Date(updatedAt);
  updatedAtDate.setTime(updatedAtDate.getTime() + expiresIn * 1000);
  return updatedAtDate < new Date(Date.now());
};