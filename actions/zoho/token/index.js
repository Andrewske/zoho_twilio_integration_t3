'use server';
import { prisma } from '~/utils/prisma';
import { logError } from '~/utils/logError';
import { notify } from '~/utils/notify';

export const buildParams = async ({ refreshToken, clientId, clientSecret }) => {
  return new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
};

export const buildUrl = async (params) => {
  return `https://accounts.zoho.com/oauth/v2/token?${params.toString()}`;
};

export const updateAccount = async ({ id, access_token, expires_in }) => {
  return await prisma.account.update({
    where: { id },
    data: {
      accessToken: access_token,
      expiresIn: expires_in,
      lastRefreshAt: new Date(),
      lastRefreshError: null,
      lastRefreshErrorAt: null,
    },
  });
};

// Persist a refresh failure on the Account row so the picker can avoid it.
// Notify only on the first failure of an outage (state transition) to avoid
// pager spam under sustained outage. Swallows DB errors so the original Zoho
// failure is not shadowed.
export const markAccountFailure = async (id, reason) => {
  try {
    const before = await prisma.account.findUnique({
      where: { id },
      select: { lastRefreshError: true },
    });
    await prisma.account.update({
      where: { id },
      data: { lastRefreshError: reason, lastRefreshErrorAt: new Date() },
    });
    // Require row existed and was previously healthy. If `before` is null
    // (account vanished mid-flight), skip notify — orphan write isn't an outage.
    if (before && !before.lastRefreshError) {
      try {
        await notify({ type: 'ZOHO_REFRESH_FAILED', data: { accountId: id, reason } });
      } catch (notifyErr) {
        logError({
          message: 'markAccountFailure notify call failed',
          error: notifyErr,
          level: 'error',
          data: { accountId: id, reason },
        });
      }
    }
  } catch (dbErr) {
    logError({
      message: 'markAccountFailure DB write failed',
      error: dbErr,
      level: 'error',
      data: { accountId: id, reason },
    });
  }
};

export const refreshAccessToken = async (account) => {
  const { id, refreshToken, clientId, clientSecret } = account;

  let response;
  let data;
  try {
    const params = await buildParams({ refreshToken, clientId, clientSecret });
    const url = await buildUrl(params);
    response = await fetch(url, { method: 'POST', cache: 'no-cache' });
    data = await response.json().catch(() => ({}));
  } catch (networkErr) {
    await markAccountFailure(id, `network: ${networkErr.message}`);
    throw networkErr;
  }

  // Zoho returns HTTP 200 with `{error: '...'}` for invalid_client/etc.
  // Treat any error body as failure regardless of status.
  if (!response.ok || data?.error) {
    const reason = data?.error || `HTTP ${response.status}`;
    await markAccountFailure(id, reason);
    throw new Error(`Token refresh failed for account ${id}: ${reason}`);
  }
  if (!data.access_token) {
    await markAccountFailure(id, 'no access_token in response');
    throw new Error('Access token not received');
  }

  return await updateAccount({ id, access_token: data.access_token, expires_in: data.expires_in });
};
