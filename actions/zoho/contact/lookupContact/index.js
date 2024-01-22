'use server';
import { getZohoAccount } from '~/actions/zoho';
// import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';

const getContact = async ({ mobile, accessToken, zohoModule }) => {
  const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
  const criteria = `(Mobile:equals:${mobile})`;
  const url = `https://www.zohoapis.com/crm/v5/${zohoModule}/search?fields=${fields}&criteria=${criteria}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });

  if (!response.ok) {
    console.error(response.status, response.statusText);
    throw new Error(
      `getContact: Request failed with status code ${response.status}`
    );
  }

  const responseBody = await response.json();

  console.log(responseBody);
  const data = responseBody?.data;

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
  console.log({ mobile });
  for (const zohoModule of modules) {
    try {
      contact = await getContact({ mobile, accessToken, zohoModule });
    } catch (error) {
      console.error(error.message);
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
  try {
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
      throw new Error(
        `lookupContact: Could not find ${mobile} for ${studioId}`
      );
    }
    return contact;
  } catch (error) {
    console.error(error.message);
    logError({
      message: 'Error in lookupContact:',
      error,
      level: 'error',
      data: { mobile, studioId },
    });
    return null;
  }
};
