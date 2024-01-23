'use server';
import { prisma } from '~/utils/prisma';

export const buildParams = ({ refreshToken, clientId, clientSecret }) => {
  return new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
};

export const buildUrl = (params) => {
  return `https://accounts.zoho.com/oauth/v2/token?${params.toString()}`;
};

export const updateAccount = async ({
  id,
  access_token,
  expires_in
}) => {
  const updated = await prisma.account.update({
    where: { id },
    data: {
      accessToken: access_token,
      expiresIn: expires_in
    },
  });

  console.log('updateAccount', { updated })
  return updated;
};

export const refreshAccessToken = async ({
  id,
  refreshToken,
  clientId,
  clientSecret,
}) => {
  try {
    console.log('refreshAccessToken');
    const params = buildParams({ refreshToken, clientId, clientSecret });
    const url = buildUrl(params);

    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await response.json();

    console.log('refreshAccessToken', { data })

    if (!data?.access_token) {
      throw new Error('Access token not received');
    }


    const { access_token, expires_in } = data;


    return await updateAccount({ id, access_token, expires_in });

  } catch (error) {
    console.error(error);
    throw new Error('Error refreshing access token');
  }

};
