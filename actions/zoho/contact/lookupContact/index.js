'use server';
import axios from 'axios';
import { getZohoAccount } from '~/actions/zoho';

const axiosGetContact = async ({ mobile, account, zohoModule }) => {
    const response = await axios.get(
        `https://www.zohoapis.com/crm/v5/${zohoModule}/search?fields=id,Full_Name,Mobile,SMS_Opt_Out&criteria=(Mobile:equals:${mobile})`,
        {
            headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
        }
    );

    if (response.status !== 200) {
        throw new Error(`Request failed with status code ${response.status}`);
    }

    const data = response?.data?.data;
    if (!data || !data[0]) {
        throw new Error('No data returned from server');
    }

    const contact = {
        ...data[0],
        isLead: zohoModule === 'Leads',
    }
    return contact;
};

const getContact = async ({ mobile, account, zohoModule }) => {
    try {
        return await axiosGetContact({ mobile, account, zohoModule });
    } catch (error) {
        return null;
    }
};

export const lookupContact = async ({ mobile, studioId }) => {
    const account = await getZohoAccount({ studioId });

    if (!account) {
        throw new Error('Could not find Zoho account');
    }

    if (!mobile) {
        throw new Error('No number provided');
    }

    const zohoModules = ['Leads', 'Contacts'];

    for (const zohoModule of zohoModules) {
        try {
            const contact = await getContact({ mobile, account, zohoModule });
            if (contact) {
                return contact;
            }
        } catch (error) {
            console.error(`Error looking up contact in ${module}:`, error);
        }
    }

    throw new Error('No contact found');
};