'use server';
import axios from 'axios';
import { getZohoAccount } from '~/actions/zoho';

export const lookupContact = async ({ mobile, studioId, zohoModule = 'Leads' }) => {
    const account = await getZohoAccount({ studioId });

    if (!account) {
        throw new Error('Could not find Zoho account');
    }

    if (!mobile) {
        throw new Error('No number provided');
    }

    try {
        const response = await axios
            .get(
                `https://www.zohoapis.com/crm/v5/${zohoModule}/search?fields=id,Full_Name,Mobile,SMS_Opt_Out&criteria=(Mobile:equals:${mobile})`,
                {
                    headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
                }
            )

        if (response.status !== 200) {
            throw new Error(`Request failed with status code ${response.status}`);
        }

        const data = response?.data?.data;
        if (!data || !data[0]) {
            throw new Error('No data returned from server');
        }

        return data[0]

    } catch (error) {
        console.error('Error looking up contact:', { mobile, studioId, zohoModule, message: error.message });
        return null;
    }
};