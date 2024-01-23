'use server';
import { logError } from '~/utils/logError';
import {
  getStudioAccounts,
  getZohoAccountFromAccounts
} from './account';
import { refreshAccessToken } from './token';
// import { isAccessTokenExpired } from './utils';
import * as Sentry from "@sentry/nextjs";

export const getZohoAccount = async ({ studioId }) => {
  try {
    const studioAccounts = await getStudioAccounts({ studioId });
    let account = await getZohoAccountFromAccounts(studioAccounts);

    console.log('getZohoAccount', { account })

    // account.expiresIn = 0;

    // Check if the access token is expired
    if (isAccessTokenExpired(account)) {
      console.log('Access token is expired, refreshing...');
      Sentry.captureMessage('Access token is expired, refreshing...');
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
  console.log("Checking if access token is expired", JSON.stringify({ updatedAtDate, currentTime: new Date(Date.now()) }))
  return updatedAtDate < new Date(Date.now());
};