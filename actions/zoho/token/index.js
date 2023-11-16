'use server';
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

export const updateAccount = async (
  prisma,
  { id, access_token, expires_in /*, api_domain */ }
) => {
  return await prisma.account.update({
    where: { id },
    data: {
      accessToken: access_token,
      expiresIn: expires_in,
      // apiDomain: api_domain,
    },
  });
};

export const refreshAccessToken = async (
  axios,
  prisma,
  { id, refreshToken, clientId, clientSecret }
) => {
  const params = buildParams({ refreshToken, clientId, clientSecret });
  const url = buildUrl(params);

  const data = await axios.post(url).then((res) => res.data);
  const { access_token, expires_in, api_domain } = data;

  if (!access_token) {
    throw new Error('Access token not received');
  }

  await updateAccount(prisma, { id, access_token, expires_in, api_domain });

  return access_token;
};
