'use server';
// Re-export from centralized AccountManager utility
export const getZohoAccount = async ({ studioId }) => {
  const { AccountManager } = await import('~/utils/accountManager');
  return await AccountManager.getZohoAccount(studioId);
};

export const isAccessTokenExpired = async (account) => {
  const { AccountManager } = await import('~/utils/accountManager');
  return AccountManager.isAccessTokenExpired(account);
};