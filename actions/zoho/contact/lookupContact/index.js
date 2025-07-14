'use server';
import { getZohoAccount } from '~/actions/zoho';
import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';
import refreshAndRetry from '../../token/refreshAndRetry';

const searchMobileQuery = async ({ mobile, account, zohoModule }) => {
  const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
  const criteria = `(Mobile:equals:${formatMobile(mobile)})`;
  const url = `https://www.zohoapis.com/crm/v5/${zohoModule}/search?fields=${fields}&criteria=${criteria}`;

  return await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${account?.accessToken}` },
    cache: 'no-cache',
    revalidate: 0
  });
}

const getContact = async (props) => {
  let response = await searchMobileQuery(props)


  if (!response.ok) {
    console.error(`getContact: response not ok ${response?.status} ${response?.statusText}`)
    response = await refreshAndRetry(searchMobileQuery, props);
  }

  let responseBody = await response?.json();

  const data = responseBody?.data;

  if (!data || !data[0]) {
    console.error('getContact: No data returned from server', JSON.stringify(responseBody));
    throw new Error('getContact: No data returned from server');
  }

  const contact = {
    ...data[0],
    isLead: props.zohoModule === 'Leads',
  };

  return contact;
};

const getContactFromModules = async ({ mobile, account, studioId, modules }) => {
  let contact = null;
  for (const zohoModule of modules) {
    try {
      contact = await getContact({ mobile, account, studioId, zohoModule });
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
  try {
    console.log(`🔍 Starting lookupContact for mobile: ${mobile}, studioId: ${studioId}`);
    
    if (!mobile) {
      throw new Error('lookupContact: No mobile provided to lookupContact');
    }

    const account = await getZohoAccount({ studioId });
    console.log(`🔑 Got Zoho account: ${account?.clientId}, hasToken: ${!!account?.accessToken}`);

    if (!account?.accessToken) {
      throw new Error(
        `getZohoAccount: Could not get accessToken for ${studioId} in lookupContact`
      );
    }

    const zohoModules = ['Leads', 'Contacts'];
    console.log(`📋 Searching in modules: ${zohoModules.join(', ')} for mobile: ${formatMobile(mobile)}`);

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
    
    console.log(`✅ Found contact: ${contact.Full_Name} in ${contact.isLead ? 'Leads' : 'Contacts'}`);
    return contact;
  } catch (error) {
    console.error(`❌ lookupContact failed: ${error.message}`);
    logError({
      message: 'Error in lookupContact:',
      error,
      level: 'error',
      data: { mobile, studioId },
    });
    return null;
  }
};
