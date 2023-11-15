'use server'
import axios from 'axios';
import prisma from '~/utils/prisma.js';

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

export const getZohoAccountFromAccounts = (studioAccounts) => {
    const account = studioAccounts
        .map(({ Account }) => Account)
        .find(({ platform }) => platform === 'zoho');

    if (!account) {
        throw new Error('No Zoho account found for studio');
    }

    return account;
};

export const refreshAndFetchUpdatedAccount = async (account, studioId) => {
    // Refresh the access token
    await refreshAccessToken(axios, prisma, account);

    // Return a new account object with the updated access token
    const updatedAccounts = await prisma.studioAccount.findMany({
        where: { studioId },
        include: { Account: true },
    });

    return updatedAccounts
        .map(({ Account }) => Account)
        .find(({ platform }) => platform === 'zoho');
};