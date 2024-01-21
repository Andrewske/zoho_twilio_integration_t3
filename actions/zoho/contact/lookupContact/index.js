'use server';
import axios from 'axios';
import { getZohoAccount } from '~/actions/zoho';
import { formatMobile } from '~/utils';

const getContact = async ({ mobile, accessToken, zohoModule }) => {
  const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
  const criteria = `(Mobile:equals:${formatMobile(mobile)})`;
  const response = await axios.get(
    `https://www.zohoapis.com/crm/v5/${zohoModule}/search?fields=${fields}&criteria=${criteria}`,
    {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    }
  );

  if (response.status !== 200) {
    throw new Error(
      `getContact: Request failed with status code ${response.status}`
    );
  }

  const data = response?.data?.data;

  if (!data || !data[0]) {
    throw new Error('getContact: No data returned from server');
  }

  const contact = {
    ...data[0],
    isLead: zohoModule === 'Leads',
  };
  return contact;
};

const getContactFromModules = async ({ mobile, accessToken, modules }) => {
  let contact = null;
  for (const zohoModule of modules) {
    try {
      contact = await getContact({ mobile, accessToken, zohoModule });
    } catch (error) {
      console.info(
        `getContactFromModules: Contact ${mobile} not found in module ${zohoModule}`
      );
    }
  }

  if (!contact) {
    throw new Error(
      `getContactFromModules: Contact ${mobile} not found in any module`
    );
  }

  return contact;
};

export const lookupContact = async ({ mobile, studioId }) => {
  if (!mobile) {
    throw new Error('lookupContact: No mobile provided to lookupContact');
  }

  const { accessToken } = await getZohoAccount({ studioId });

  if (!accessToken) {
    throw new Error(
      `getZohoAccount: Could not get accessToken for ${studioId} in lookupContact`
    );
  }

  const zohoModules = ['Leads', 'Contacts'];

  const contact = await getContactFromModules({
    mobile,
    accessToken,
    modules: zohoModules,
  });

  if (!contact) {
    throw new Error(`lookupContact: Could not find ${mobile} for ${studioId}`);
  }
  return contact;
};
