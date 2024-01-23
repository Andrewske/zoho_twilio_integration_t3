'use server';
import { prisma } from '~/utils/prisma.js';


export const getStudioAccounts = async ({ studioId }) => {
  if (!studioId) {
    throw new Error('Studio ID is required');
  }

  return await prisma.studioAccount.findMany({
    where: { studioId },
    include: { Account: true },
  });
};


export const getZohoAccountFromAccounts = (studioAccounts) => {
  const account = studioAccounts
    .map(({ Account }) => Account)
    .find(({ platform }) => platform === 'zoho');

  return account || null;
};


export const getStudioFromZohoId = async (zohoId) => {
  if (!zohoId) {
    throw new Error('Zoho ID is required');
  }

  return await prisma.studio.findFirst({
    where: { zohoId },
  });
};




