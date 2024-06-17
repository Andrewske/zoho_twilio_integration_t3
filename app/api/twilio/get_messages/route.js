import { getTwilioAccount, getTwilioClient } from "~/actions/twilio";
import axios from "axios";
import { getZohoAccount } from "~/actions/zoho";
import FormData from "form-data";
import { logError } from "~/utils/logError";


export async function GET(request) {
    console.log('CRON update analytics')
    const authHeader = request.headers.get('authorization');
    if (
        process.env.NODE_ENV === 'production' &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return new Response('Unauthorized', {
            status: 401,
        });
    }

    try {
        const messages = await getLastWeekOfMessages();

        await uploadMessagesToZoho(messages)

        return new Response('OK', {
            status: 200,
        });

    } catch (error) {
        console.error(error);
        logError({
            message: 'Error in Updating Analytics:',
            error,
            level: 'error',
            data: {},
        });
        return new Response('Error', {
            status: 500,
        });
    }
}


const getLastWeekOfMessages = async () => {
    const now = new Date();

    const oneWeekAgo = new Date();

    // Set the time to the start of the day (midnight)
    oneWeekAgo.setHours(0, 0, 0, 0);
    // Subtract 7 days worth of milliseconds from the current date
    oneWeekAgo.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);


    // // Get all the messages from Twilio
    const twilioAccount = await getTwilioAccount(process.env.ADMIN_STUDIO_ID);

    const client = getTwilioClient(twilioAccount);

    const messages = await client.messages.list({ dateSentAfter: oneWeekAgo }).then(messages => messages.map(message => {
        return {
            sid: message.sid,
            from: message.from,
            to: message.to,
            body: message.body,
            status: message.status,
            date: formatDate(message.dateSent),
            direction: message.direction,
        };
    }));

    return messages
}


const uploadMessagesToZoho = async (messages) => {
    const account = await getZohoAccount({ studioId: process.env.ADMIN_STUDIO_ID });

    const config = {
        importType: 'updateadd', // or 'truncateadd', 'updateadd'
        fileType: 'json', // or 'csv', 'autoIdentify'
        autoIdentify: 'true',
        onError: 'abort', // or 'skiprow', 'setcolumnempty'
        matchingColumns: ['sid'], // Only needed for 'updateadd'
        // selectedColumns: ['column1', 'column2'],
        // Additional configuration options...
    };

    const workspaceId = '2511121000000015263'
    const viewId = '2511121000004625031'
    const orgId = '770600067'
    const apiUrl = `https://analyticsapi.zoho.com/restapi/v2/workspaces/${workspaceId}/views/${viewId}/data`

    const payload = JSON.stringify(messages);

    const formData = new FormData();

    formData.append('DATA', payload);

    formData.append('CONFIG', JSON.stringify(config));

    // Axios POST request
    // Axios POST request
    axios.post(apiUrl, formData, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${account.accessToken}`, // Replace with actual token
            'oauthscope': 'ZohoAnalytics.data.create',
            'ZANALYTICS-ORGID': orgId,
            ...formData.getHeaders(),
        },
    })
        .then(response => {
            console.log('Data imported successfully:', response.data);
        })
        .catch(error => {
            console.error('Error importing data:', error.response ? error.response.data : error.message);
            logError({ message: 'Error uploading to Zoho', error, level: 'error' })
        });
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-based
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

