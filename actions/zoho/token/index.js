'use server';
import prisma from '~/utils/prisma';

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
  expires_in /*, api_domain */,
}) => {
  return await prisma.account.update({
    where: { id },
    data: {
      accessToken: access_token,
      expiresIn: expires_in,
      // apiDomain: api_domain,
    },
  });
};

export const refreshAccessToken = async ({
  id,
  refreshToken,
  clientId,
  clientSecret,
}) => {
  console.log('refreshAccessToken');
  const params = buildParams({ refreshToken, clientId, clientSecret });
  const url = buildUrl(params);

  const response = await fetch(url, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Network response was not ok');
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('Access token not received');
  }

  const { access_token, expires_in, api_domain } = data;

  await updateAccount({ id, access_token, expires_in, api_domain });

  return access_token;
};
