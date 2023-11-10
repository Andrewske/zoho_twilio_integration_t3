'use server'
import axios from 'axios';
import rollbar, { logError } from '../../utils/rollbar.js';

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const apiDomain = process.env.NODE_ENV === 'production' ? process.env.ZOHO_API_DOMAIN_PROD : process.env.ZOHO_API_DOMAIN_PROD;
const platform = 'dev'

export const getAccessToken = async () => {
    let { accessToken, expiresIn, updatedAt } = await prisma.account.findFirst({ where: { platform: platform }, select: { accessToken: true, expiresIn: true, updatedAt: true } });
    let updatedAtDate = new Date(updatedAt);
    updatedAtDate.setTime(updatedAtDate.getTime() + (expiresIn * 1000));

    if (updatedAtDate < new Date()) {
        console.log('updating access token')
        accessToken = await refreshAccessToken()
    }
    return accessToken
}


// https://www.zoho.com/crm/developer/docs/api/v5/refresh.html
// https://accounts.zoho.com/oauth/v2/token?refresh_token={refresh_token}&client_id={client_id}&client_secret={client_secret}&grant_type=refresh_token
export const refreshAccessToken = async () => {
    let { id, refreshToken, clientId, clientSecret } = await prisma.account.findFirst({ where: { platform: platform }, select: { id: true, refreshToken: true, clientId: true, clientSecret: true } });

    const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`;


    try {
        const { data: { access_token, expires_in } } = await axios.post(url);
        if (access_token) {
            await prisma.account.update({ where: { id }, data: { accessToken: access_token, expiresIn: expires_in } })
            return access_token
        }
    } catch (error) {
        logError(error)
    }

}


export const getStudioId = async (number) => {
    console.log(number)
    const { zohoId } = await prisma.studio.findUnique({ where: { phone: number.replace('+1', '') }, select: { zohoId: true } })
    return zohoId
}



// `https://www.zohoapis.com/crm/v5/Leads/search?criteria=Mobile:equals:${number}`
// `https://www.zohoapis.com/crm/v5/Contacts/search?phone=${number}`
export const lookupLead = async (from) => {
    console.log('lookupLead', { from })

    const accessToken = await getAccessToken()
    const headers = {
        'Authorization': 'Bearer ' + accessToken
    }

    const url = `${apiDomain}/crm/v5/Leads/search?criteria=Mobile:equals:${from}`

    try {
        const { data } = await axios.get(url, { headers }).then(res => res.data)
        const numberOfLeads = data?.length
        let leadId = data[0]?.id
        let leadName = data[0]?.Full_Name
        if (numberOfLeads > 1) {
            rollbar.log('Found multiple leads with this phone number', { number: from })
        }

        return { leadId, leadName }

    } catch (error) {
        logError(error)
    }
}




export const createTask = async ({ studioId, lead = null, message }) => {
    console.log('createTask', { studioId, lead, message })
    const { to, from, msg } = message
    const { leadId = null, leadName = null } = lead ?? {};

    const data = {
        "data": [{
            "Owner": {
                "id": studioId // studioId
            },
            "Status": "Not Started",
            "Send_Notification_Email": false, // Maybe?
            "Description": `TO: ${to} FROM: ${from} MSG: ${msg}`,
            "Priority": "Low",
            "send_notification": true,
            "Subject": "New SMS Message",
        }]
    }

    if (leadId && leadName) {
        data.data[0]["What_Id"] = { "id": leadId, "name": leadName };
        data.data[0]["$se_module"] = "Leads";
    }


    const url = `${apiDomain}/crm/v5/Tasks`

    const accessToken = await getAccessToken()
    const headers = {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
    }

    try {
        await axios.post(url, data, { headers })
    } catch (error) {
        logError(error)
    }
}
