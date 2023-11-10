import { createTask, getStudioId, lookupLead } from '~/actions/zoho';
import { logError } from '~/utils/rollbar';
import { parse } from 'querystring';

export async function POST(request) {
    const body = await request.text();
    const res = parse(body);
    const { To: to, From: from, Body: msg } = res;
    try {
        const toStudio = await getStudioId(to)
        console.log('toStudio', toStudio)

        if (toStudio) {
            const lead = await lookupLead(from)
            console.log('lead', lead)
            createTask({ studioId: toStudio, lead, message: { to, from, msg } })
        }
    } catch (error) {
        logError(error)
    }
    return new Response(null, { status: 200 });
}