import axios from 'axios';
import { getZohoAccount } from '~/actions/zoho/index.js';
import { logError } from '~/utils/logError';

export const updateContact = async ({ studioId, contactId, data, module = 'Leads' }) => {
  console.log('updateContact', { studioId, contactId, data, module });
  const account = await getZohoAccount({ studioId });
  try {
    await axios
      .put(
        `https://www.zohoapis.com/crm/v5/${module}/${contactId}`,
        data,
        {
          headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
        }
      )
      .then((res) => res.data);


  } catch (error) {
    logError({ message: 'Error updating contact:', error, data })
    console.error('Error updating contact:', error.message);
  }
};
