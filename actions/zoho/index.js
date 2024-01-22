'use server';
import { logError } from '~/utils/logError';
import {
  getStudioAccounts,
  getZohoAccountFromAccounts,
  refreshAndFetchUpdatedAccount,
} from './account';
import { isAccessTokenExpired } from './utils';
import * as Sentry from "@sentry/nextjs";

export const getZohoAccount = async ({ studioId }) => {
  try {
    const studioAccounts = await getStudioAccounts({ studioId });
    const account = await getZohoAccountFromAccounts(studioAccounts);

    // Check if the access token is expired
    if (isAccessTokenExpired(account)) {
      Sentry.captureMessage('Access token is expired, refreshing...');
      return await refreshAndFetchUpdatedAccount(account, studioId);
    }

    console.log('Access token is not expired, returning account', { account });

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
