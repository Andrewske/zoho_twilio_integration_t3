'use server';
import { prisma } from '~/utils/prisma.js';

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

export const getZohoAccountFromAccounts = (studioAccounts) => {
  const account = studioAccounts
    .map(({ Account }) => Account)
    .find(({ platform }) => platform === 'zoho');

  if (!account) {
    throw new Error('No Zoho account found for studio');
  }

  return account;
};

export const refreshAndFetchUpdatedToken = async (account) => {
  // Refresh the access token
  const accessToken = await refreshAccessToken(account);

  return accessToken;

  // Return a new account object with the updated access token
  // const updatedAccounts = await prisma.studioAccount.findMany({
  //   where: { studioId },
  //   include: { Account: true },

  // });

  // return updatedAccounts
  //   .map(({ Account }) => Account)
  //   .find(({ platform }) => platform === 'zoho');
};
