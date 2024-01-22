'use server';
import { getZohoAccount } from '~/actions/zoho/index.js';
import { logError } from '~/utils/logError';

export const updateContact = async ({
  studioId,
  contactId,
  data,
  module = 'Leads',
}) => {
  const account = await getZohoAccount({ studioId });
  try {
    const response = await fetch(`https://www.zohoapis.com/crm/v5/${module}/${contactId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Zoho-oauthtoken ${account?.accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    logError({
      message: 'Error updating contact:',
      error,
      level: 'warning',
      data: { studioId, contactId, module },
    });
  }
};
