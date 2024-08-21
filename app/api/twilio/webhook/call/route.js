import { logError } from "~/utils/logError";
import { formatMobile } from "~/utils";
import { getStudioFromPhoneNumber } from "~/actions/zoho/studio";



export async function POST(request) {
    try {

        const text = await request.text();
        const body = new URLSearchParams(text);
        const toNumber = formatMobile(body.get('To'));

        // console.log({ text, body, toNumber, request })

        const studio = await getStudioFromPhoneNumber(toNumber);

        let messageContent;


        if (studio?.callPhone) {
            messageContent = `
            <Response>
                <Say voice="woman">Thanks for the call. This number is for text messages only.</Say>
                <Pause length="1" />
                <Say voice="woman">If you would like to reach our studio you can text this number or call us at ${studio.callPhone.toString().split('').join(' ')}.</Say>
                <Pause length="1"/>
                <Say voice="woman">We look forward to speaking with you soon.</Say>
            </Response>
            `
        } else {
            messageContent = `
            
            <Response>
                <Say voice="woman">Thanks for the call. This number is for text messages only.</Say>
                <Pause length="1" />
                <Say voice="woman">If you would like to reach our studio you can text this number.</Say>
                <Pause length="1" />
                <Say voice="woman">We look forward to speaking with you soon.</Say>
            </Response>
        `
        }



        const xmlResponse =
            `
            ${messageContent}
            `;

        return new Response(xmlResponse, {
            headers: {
                'Content-Type': 'text/xml',
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