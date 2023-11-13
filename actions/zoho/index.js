'use server';
import axios from 'axios';
import rollbar, { logError } from '../../utils/rollbar.js';

import prisma from '~/utils/prisma.js';

// Prod
// const apiDomain = process.env.NODE_ENV === 'production' ? 'https://www.zohoapis.com' : 'https://sandbox.zohoapis.com';
// const platform = 'zoho';

export const getZohoAccount = async (studioId) => {
  console.log('Getting Zoho account for studio:', studioId);

  if (!studioId) {
    return null;
  }

  const studioAccounts = await prisma.studioAccount.findMany({
    where: {
      studioId: studioId,
    },
    include: {
      Account: true,
    },
  });

  let account = studioAccounts
    .map((sa) => sa.Account)
    .find((account) => account.platform === 'zoho');

  if (!account) {
    console.error('No Zoho account found for studio:', studioId);
    return null;
  }

  let {
    id,
    accessToken,
    expiresIn,
    updatedAt,
    apiDomain,
    refreshToken,
    clientId,
    clientSecret,
  } = account;

  let updatedAtDate = new Date(updatedAt);
  updatedAtDate.setTime(updatedAtDate.getTime() + expiresIn * 1000);

  if (updatedAtDate < new Date()) {
    accessToken = await refreshAccessToken({
      id,
      refreshToken,
      clientId,
      clientSecret,
    });
  }

  return { id, accessToken, expiresIn, updatedAt, apiDomain };
};

// export const getAccessToken = async (studioId) => {
//   console.log('getting access token', studioId);
//   let { accessToken, expiresIn, updatedAt } = await getZohoAccount(studioId);

//   let updatedAtDate = new Date(updatedAt);
//   updatedAtDate.setTime(updatedAtDate.getTime() + expiresIn * 1000);
//   console.log({ accessToken, updatedAtDate });

//   if (updatedAtDate < new Date()) {
//     accessToken = await refreshAccessToken(studioId);
//   }
//   return accessToken;
// };

// https://www.zoho.com/crm/developer/docs/api/v5/refresh.html
// https://accounts.zoho.com/oauth/v2/token?refresh_token={refresh_token}&client_id={client_id}&client_secret={client_secret}&grant_type=refresh_token
export const refreshAccessToken = async ({
  id,
  refreshToken,
  clientId,
  clientSecret,
}) => {
  console.log('Refreshing token for account:', id);

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const url = `https://accounts.zoho.com/oauth/v2/token?${params.toString()}`;

  try {
    const data = await axios.post(url).then((res) => res.data);
    const { access_token, expires_in, api_domain } = data;

    if (!access_token) {
      console.log(data);
      throw new Error('Access token not received');
    }

    await prisma.account.update({
      where: { id },
      data: {
        accessToken: access_token,
        expiresIn: expires_in,
        apiDomain: api_domain,
      },
    });

    return access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error.message);
    throw error;
  }
};

export const getStudioData = async ({ zohoId, phone = null }) => {
  const where = phone ? { phone } : { zohoId };
  console.log({ where });
  try {
    const studio = await prisma.studio.findFirst({
      where: where,
    });
    console.log({ studio });
    return studio;
  } catch (error) {
    console.error({ message: 'Could not find studio', zohoId });
    logError({ message: 'Could not find studio', zohoId });
  }
};

// `https://www.zohoapis.com/crm/v5/Leads/search?criteria=Mobile:equals:${number}`
// `https://www.zohoapis.com/crm/v5/Contacts/search?phone=${number}`
export const lookupLead = async ({ from, studioId }) => {
  console.log('Looking up lead for studio:', studioId, 'from:', from);

  const { accessToken, apiDomain } = await getZohoAccount(studioId);
  const headers = {
    Authorization: 'Bearer ' + accessToken,
  };
  const url = `${apiDomain}/crm/v5/Leads/search?criteria=Mobile:equals:${from}`;

  try {
    const { data } = await axios.get(url, { headers }).then((res) => res.data);
    let leadId, leadName;
    if (data && Array.isArray(data) && data.length > 0) {
      leadId = data[0]?.id;
      leadName = data[0]?.Full_Name;
    }

    if (data?.length > 1) {
      rollbar.log('Found multiple leads with this phone number', {
        number: from,
      });
    }

    console.log('Found lead:', leadId, 'name:', leadName);
    return { leadId, leadName };
  } catch (error) {
    console.error({ message: 'Could not find lead', from });
    logError(error);
  }
};

export const createTask = async ({
  studioId,
  zohoId,
  lead = null,
  message,
}) => {
  const { to, from, msg } = message;
  const { leadId = null, leadName = null } = lead ?? {};

  console.log(
    'Creating task for studio:',
    studioId,
    'lead:',
    leadId,
    'name:',
    leadName
  );

  const taskData = {
    Owner: {
      id: zohoId,
    },
    Status: 'Not Started',
    Send_Notification_Email: false,
    Description: `TO: ${to} FROM: ${from} MSG: ${msg}`,
    Priority: 'Low',
    send_notification: true,
    Subject: 'New SMS Message',
  };

  if (leadId && leadName) {
    taskData['What_Id'] = { id: leadId, name: leadName };
    taskData['$se_module'] = 'Leads';
  }

  const data = { data: [taskData] };

  console.log('Task data:', data);

  const { apiDomain, accessToken } = await getZohoAccount(studioId);

  const url = `${apiDomain}/crm/v5/Tasks`;

  const headers = {
    Authorization: 'Bearer ' + accessToken,
    'Content-Type': 'application/json',
  };

  try {
    const data = await axios
      .post(url, data, { headers })
      .then((res) => res.data);
    console.log('Task created:', data);
  } catch (error) {
    console.error('Error creating task:', error.message);
    throw error;
  }
};
