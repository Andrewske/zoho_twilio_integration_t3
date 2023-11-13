'use server';
import axios from 'axios';
import rollbar, { logError } from '../../utils/rollbar.js';

import prisma from '~/utils/prisma.js';

// Prod
// const apiDomain = process.env.NODE_ENV === 'production' ? 'https://www.zohoapis.com' : 'https://sandbox.zohoapis.com';
// const platform = 'zoho';

const apiDomain = (sandbox = false) => {
  return sandbox ? 'https://sandbox.zohoapis.com' : 'https://www.zohoapis.com';
};

const getZohoAccount = async (studioId) => {
  const studioAccounts = await prisma.studioAccount.findMany({
    where: {
      studioId: studioId,
    },
    include: {
      Account: true,
    },
  });
  let { id, accessToken, expiresIn, updatedAt, clientId, clientSecret } =
    studioAccounts
      .map((sa) => sa.Account)
      .find((account) => account.platform === 'zoho');
  console.log({
    id,
    accessToken,
    expiresIn,
    updatedAt,
    clientId,
    clientSecret,
  });
  return { id, accessToken, expiresIn, updatedAt, clientId, clientSecret };
};

export const getAccessToken = async (studioId) => {
  console.log('getting access token', studioId);
  let { accessToken, expiresIn, updatedAt } = await getZohoAccount(studioId);

  let updatedAtDate = new Date(updatedAt);
  updatedAtDate.setTime(updatedAtDate.getTime() + expiresIn * 1000);
  console.log({ accessToken, updatedAtDate });

  if (updatedAtDate < new Date()) {
    accessToken = await refreshAccessToken(studioId);
  }
  return accessToken;
};

// https://www.zoho.com/crm/developer/docs/api/v5/refresh.html
// https://accounts.zoho.com/oauth/v2/token?refresh_token={refresh_token}&client_id={client_id}&client_secret={client_secret}&grant_type=refresh_token
export const refreshAccessToken = async (studioId) => {
  console.log('refreshing token', studioId);
  let { id, refreshToken, clientId, clientSecret } = getZohoAccount(studioId);
  console.log({ id, refreshToken, clientId, clientSecret });

  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`;
  try {
    const {
      data: { access_token, expires_in },
    } = await axios.post(url);
    if (access_token) {
      await prisma.account.update({
        where: { id },
        data: { accessToken: access_token, expiresIn: expires_in },
      });
      return access_token;
    }
  } catch (error) {
    logError(error);
  }
};

export const getStudioData = async ({ user, phone = null }) => {
  const { id: zohoId } = user ?? { id: null };

  const where = phone ? { phone } : { zohoId };
  console.log({ where });
  try {
    const studio = await prisma.studio.findFirst({
      where: where,
    });
    console.log({ studio });
    return studio;
  } catch (error) {
    console.error({ message: 'Could not find studio', user });
    logError({ message: 'Could not find studio', user });
  }
};

export const getStudioId = async (number) => {
  const { id, zohoId } = await prisma.studio.findFirst({
    where: { phone: number.replace('+1', '') },
    select: { id: true, zohoId: true },
  });
  return { id, zohoId };
};

// `https://www.zohoapis.com/crm/v5/Leads/search?criteria=Mobile:equals:${number}`
// `https://www.zohoapis.com/crm/v5/Contacts/search?phone=${number}`
export const lookupLead = async ({ from, studioId, sandbox = false }) => {
  console.log('lookupLead', { from, studioId, sandbox });

  const accessToken = await getAccessToken(studioId);
  console.log({ accessToken });
  const headers = {
    Authorization: 'Bearer ' + accessToken,
  };
  const apiUrl = apiDomain(sandbox);
  console.log({ apiUrl });
  const url = `${apiUrl}/crm/v5/Leads/search?criteria=Mobile:equals:${from}`;
  console.log(url);
  try {
    const { data } = await axios.get(url, { headers }).then((res) => res.data);
    const numberOfLeads = data?.length;
    let leadId = data[0]?.id;
    let leadName = data[0]?.Full_Name;
    if (numberOfLeads > 1) {
      rollbar.log('Found multiple leads with this phone number', {
        number: from,
      });
    }

    return { leadId, leadName };
  } catch (error) {
    console.error({ message: 'Could not find lead', from });
    logError(error);
  }
};

export const createTask = async ({
  studioId,
  lead = null,
  message,
  sandbox = false,
}) => {
  console.log('createTask', { studioId, lead, message });
  const { to, from, msg } = message;
  const { leadId = null, leadName = null } = lead ?? {};

  const data = {
    data: [
      {
        Owner: {
          id: studioId, // studioId
        },
        Status: 'Not Started',
        Send_Notification_Email: false, // Maybe?
        Description: `TO: ${to} FROM: ${from} MSG: ${msg}`,
        Priority: 'Low',
        send_notification: true,
        Subject: 'New SMS Message',
      },
    ],
  };

  if (leadId && leadName) {
    data.data[0]['What_Id'] = { id: leadId, name: leadName };
    data.data[0]['$se_module'] = 'Leads';
  }

  const apiUrl = apiDomain(sandbox);

  const url = `${apiUrl}/crm/v5/Tasks`;

  const accessToken = await getAccessToken();
  const headers = {
    Authorization: 'Bearer ' + accessToken,
    'Content-Type': 'application/json',
  };

  try {
    await axios.post(url, data, { headers });
  } catch (error) {
    logError(error);
  }
};
