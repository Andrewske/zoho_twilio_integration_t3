import axios from 'axios';
import { getZohoAccount } from '~/actions/zoho/index.js';

export const updateContact = async ({ studioId, contactId, data, module = 'Leads' }) => {
  console.log('updateContact', { studioId, contactId, data, module });
  const account = await getZohoAccount({ studioId });
  try {
    const response = await axios
      .put(
        `https://www.zohoapis.com/crm/v5/${module}/${contactId}`,
        data,
        {
          headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
        }
      )
      .then((res) => res.data);

    console.log(response.data);
  } catch (error) {
    console.error('Error updating contact:', error.message);
  }
};
