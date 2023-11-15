'use server'
import axios from "axios";
import { getZohoAccount } from "..";

export const lookupLead = async ({ from, studioId }) => {
    const account = await getZohoAccount({ studioId });

    try {
        const response = await axios.get(`https://www.zohoapis.com/crm/v5/Leads/search?criteria=(Mobile:equals:${from})`, {
            headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
        });
        const data = response.data;

        if (data.length === 0) {
            return { leadId: null, leadName: null };
        }

        return { leadId: data[0].id, leadName: data[0].Full_Name };
    } catch (error) {
        console.error('Error looking up lead:', error);
        return { leadId: null, leadName: null };
    }
};