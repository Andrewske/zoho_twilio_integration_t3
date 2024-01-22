'use server';
import { prisma, prismaQueryWrapper } from '~/utils/prisma.js';

import { refreshAccessToken } from '~/actions/zoho/token';

export const getStudioAccounts = async ({ studioId }) => {
  if (!studioId) {
    throw new Error('Studio ID is required');
  }

  return await prisma.studioAccount.findMany({
    where: { studioId },
    include: { Account: true },
  });
};

export const getStudioFromZohoId = async (zohoId) => {
  if (!zohoId) {
    throw new Error('Zoho ID is required');
  }

  return await prisma.studio.findFirst({
    where: { zohoId },
  });
};

export const getZohoAccountFromAccounts = async (studioAccounts) => {
  const account = await prismaQueryWrapper(studioAccounts
    .map(({ Account }) => Account)
    .find(({ platform }) => platform === 'zoho'));

  if (!account) {
    throw new Error('No Zoho account found for studio');
  }

  return account;
};

export const refreshAndFetchUpdatedAccount = async (account, studioId) => {
  // Refresh the access token
  await refreshAccessToken(account);

  // Return a new account object with the updated access token
  const updatedAccounts = await prismaQueryWrapper(prisma.studioAccount.findMany({
    where: { studioId },
    include: { Account: true },
  }));

  return updatedAccounts
    .map(({ Account }) => Account)
    .find(({ platform }) => platform === 'zoho');
};
