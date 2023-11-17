'use server';
import axios from 'axios';
import { getZohoAccount } from '..';

export const lookupStudent = async ({ from, studioId }) => {
    const account = await getZohoAccount({ studioId });

    try {
        const { data } = await axios
            .get(
                `https://www.zohoapis.com/crm/v5/Contacts/search?criteria=(Mobile:equals:${from})`,
                {
                    headers: { Authorization: `Zoho-oauthtoken ${account.accessToken}` },
                }
            )
            .then((res) => res.data);

        if (data.length === 0) {
            return { studentId: null, studentName: null };
        }

        return { studentId: data[0].id, studentName: data[0].Full_Name };
    } catch (error) {
        console.error('Error looking up Student:', error);
        return { studentId: null, studentName: null };
    }
};
