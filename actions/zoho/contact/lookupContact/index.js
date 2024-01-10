'use server';
import axios from 'axios';
import { getZohoAccount } from '~/actions/zoho';
// import { retryOperation } from '~/utils/retryOperation';
import { logError } from '~/utils/logError';

const formatMobile = (mobile) => {
    return mobile.replace(/\D/g, '');
};

const axiosGetContact = async ({ mobile, account, zohoModule }) => {
    const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
    const criteria = `(Mobile:equals:${formatMobile(mobile)})`;
    const response = await axios.get(
        `https://www.zohoapis.com/crm/v5/${zohoModule}/search?fields=${fields}&criteria=${criteria}`,
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

const getContactFromModules = async ({ mobile, account, modules }) => {
    for (const zohoModule of modules) {
        try {
            const contact = await getContact({ mobile, account, zohoModule });
            if (contact) {
                return contact;
            }
        } catch (error) {
            console.error(`Error looking up contact in ${module}:`);
        }
    }
    return null;
};

export const lookupContact = async ({ mobile, studioId, retry = false }) => {
    if (!mobile) {
        throw new Error('No number provided');
    }

    const account = await getZohoAccount({ studioId });

    if (!account) {
        throw new Error('Could not find Zoho account');
    }

    const zohoModules = ['Leads', 'Contacts'];
    const operation = () => getContactFromModules({ mobile, account, modules: zohoModules });

    if (retry) {
        const contact = await retryOperation(operation, 10000, 5);
        if (!contact) {
            throw new Error('No contact found after 5 retries');
        }
        return contact;
    }

    const contact = await operation();
    if (!contact) {
        logError({ error: new Error('Not contact after 5 retries'), message: 'No contact found', data: { mobile, studioId }, level: 'warning' })
        throw new Error('No contact found');
    }
    return contact;
};

const retryOperation = async (operation, delay, maxRetries) => {
    console.log('retryOperation')
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            const result = await operation();
            if (result) {
                console.log(`Result found after ${attempts} attempts`);
                return result;
            }
            // If result is not found, throw an error to go to the catch block.
            throw new Error('Result not found');
        } catch (error) {
            console.log(`Error in retryOperation, attempt: ${attempts}`)
            if (attempts === maxRetries - 1) {
                throw error;
            }
            console.log(`Retrying in ${delay * Math.pow(2, attempts)} ms`);
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempts)));
            attempts++;
        }
    }
    return null; // In case of max retries reached
};
