'use server';
import axios from 'axios';
import { getZohoAccount } from '..';

export const lookupLead = async ({ from, studioId }) => {
  const account = await getZohoAccount({ studioId });

  if (!account) {
    throw new Error('Could not find Zoho account');
  }

  if (!from) {
    throw new Error('No number provided');
  }

  try {
    const response = await axios
      .get(
        `https://www.zohoapis.com/crm/v5/Leads/search?fields=id,Full_Name,Mobile,SMS_Opt_Out&criteria=(Mobile:equals:${from})`,
        {
          headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
        }
      )
      .then((res) => res.data);

    const lead = response?.data?.[0];

    if (!lead) {
      throw new Error(response);
    }

    return { leadId: lead.id, leadName: lead.Full_Name };
  } catch (error) {
    console.error('Error looking up lead:', error);
    return { leadId: null, leadName: null };
  }
};
