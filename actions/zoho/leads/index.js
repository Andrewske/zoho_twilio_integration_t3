'use server';
import axios from 'axios';
import { getZohoAccount } from '..';

export const lookupLead = async ({ from, studioId }) => {
  const account = await getZohoAccount({ studioId });
  console.log({ account });

  try {
    const { data } = await axios
      .get(
        `https://www.zohoapis.com/crm/v5/Leads/search?fields=id,Full_Name,Mobile,SMS_Opt_Out&criteria=(Mobile:equals:${from})`,
        {
          headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
        }
      )
      .then((res) => res.data);

    console.log({ data });

    if (data.length === 0) {
      return { leadId: null, leadName: null };
    }

    return { leadId: data[0].id, leadName: data[0].Full_Name };
  } catch (error) {
    console.error('Error looking up lead:', error);
    return { leadId: null, leadName: null };
  }
};
