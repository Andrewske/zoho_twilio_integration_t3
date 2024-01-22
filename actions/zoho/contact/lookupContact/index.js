'use server';
import { getZohoAccount } from '~/actions/zoho';
import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';
import { refreshAndFetchUpdatedToken } from '../../account';

const searchMobileQuery = async ({ mobile, accessToken, zohoModule }) => {
  const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
  const criteria = `(Mobile:equals:${formatMobile(mobile)})`;
  const url = `https://www.zohoapis.com/crm/v5/${zohoModule}/search?fields=${fields}&criteria=${criteria}`;

  return await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
}

const getContact = async ({ mobile, account, studioId, zohoModule }) => {
  let response = await searchMobileQuery({ mobile, accessToken: account?.accessToken, zohoModule })

  let responseBody = await response.json();

  console.log({ responseBody, ok: response.ok, status: response.status })

  if (!response.ok) {
    if (responseBody?.code === 'INVALID_TOKEN') {
      const accessToken = await refreshAndFetchUpdatedToken(account);
      response = await searchMobileQuery({ mobile, accessToken, zohoModule })
      responseBody = await response.json();


      if (!response.ok) {
        logError({
          error: new Error(`getContact: Could not refresh token ${response.status}`),
          data: { mobile, studioId },
          level: 'fatal',
          message: 'Fatal Error in getContact:'
        })
      }
    } else {
      throw new Error(
        `getContact: Request failed with status code ${response.status}`
      );
    }
  }

  console.error({ responseBody })


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

const getContactFromModules = async ({ mobile, account, studioId, modules }) => {
  let contact = null;
  console.log({ mobile });
  for (const zohoModule of modules) {
    try {
      contact = await getContact({ mobile, account, studioId, zohoModule });
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

    const account = await getZohoAccount({ studioId });

    if (!account?.accessToken) {
      throw new Error(
        `getZohoAccount: Could not get accessToken for ${studioId} in lookupContact`
      );
    }

    const zohoModules = ['Leads', 'Contacts'];

    const contact = await getContactFromModules({
      mobile,
      account,
      studioId,
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
