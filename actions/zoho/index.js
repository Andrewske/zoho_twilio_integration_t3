'use server';
import { logError } from '~/utils/logError';
import {
  getStudioAccounts,
  getZohoAccountFromAccounts,
  refreshAndFetchUpdatedToken,
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
      const accessToken = await refreshAndFetchUpdatedToken(account);
      return {
        ...account,
        accessToken,
      }
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
    throw new Error('Error getting Zoho account');
  }
};
