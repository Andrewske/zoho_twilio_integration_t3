import axios from 'axios';
import { getZohoAccount } from '~/actions/zoho/index.js';

export const updateContact = async ({ studioId, student, lead }) => {
  const account = await getZohoAccount({ studioId });

  try {
    const { data } = await axios
      .put(
        `https://www.zohoapis.com/crm/v5/Leads`,
        {},
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
