import { logError } from "~/utils/logError";
import { getStudioInfo } from "../route";



export async function POST(request) {
    try {

        const text = await request.text();
        const body = new URLSearchParams(text);
        const toNumber = body.get('To');

        const studio = await getStudioInfo(toNumber);

        let messageContent;

        if (studio?.callPhone) {
            messageContent = `
            <Response>
                <Say voice="woman">Thanks for the call. This number is for text messages only.</Say>
                    <Pause length="1"/>
                <Say voice="woman">If you would like to reach our studio you can text this number or call us at ${studio?.callPhone}.</Say>
                    <Pause length="1"/>
                <Say voice="woman">We look forward to speaking with you soon.</Say>
            </Response>
            `
        } else {
            messageContent = `

                <Say voice="woman">Thanks for the call. This number is for text messages only.</Say>
                    <Pause length="1"/>
                <Say voice="woman">If you would like to reach our studio you can text this number.</Say>
                    <Pause length="1"/>
                <Say voice="woman">We look forward to speaking with you soon.</Say>

            `
        }


        const xmlResponse = `
                <?xml version="1.0" encoding="UTF-8"?>
                ${messageContent}
            `;

        return new Response(xmlResponse, {
            status: 200,
            headers: {
                'Content-Type': 'application/xml',
            },
        });

    } catch (error) {
        console.error(error);
        logError({
            message: 'Error in Twilio Webhook:',
            error,
            level: 'error',
            data: {},
        });
        return new Response(null, { status: 500 });
    }
}