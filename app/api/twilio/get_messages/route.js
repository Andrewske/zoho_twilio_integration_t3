import { getTwilioAccount, getTwilioClient } from "~/actions/twilio";
import { getZohoAccount } from "~/actions/zoho";
import { logError } from "~/utils/logError";
import { captureServerEvent } from "~/utils/postHogServer";
import { uploadMessagesToZoho } from "~/utils/zohoAnalytics";


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

        const account = await getZohoAccount({ studioId: process.env.ADMIN_STUDIO_ID });
        await uploadMessagesToZoho(messages, { accessToken: account.accessToken });

        // Heartbeat for the absence alert: if no ANALYTICS_IMPORT_OK lands in a
        // 25h window, PostHog pages us — catches both upload failure AND the cron
        // silently not firing (the failure mode that hid this bug for ~63 days).
        await captureServerEvent('ANALYTICS_IMPORT_OK', { count: messages.length });

        return new Response('OK', {
            status: 200,
        });

    } catch (error) {
        console.error(error);
        await logError({
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


function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-based
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

