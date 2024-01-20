import prisma from '~/utils/prisma';
import axios from 'axios';
import { NextResponse } from 'next/server';

// import { logError } from '~/utils/logError';
import { getZohoAccount } from '~/actions/zoho';

import sendFollowUpMessage from '~/actions/sendFollowUpMessage';
import { getStudioFromZohoId } from '../zoho/send_welcome/route';

export async function GET(request) {
    console.log("CRON STARTED")
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', {
            status: 401,
        });
    }
    try {
        // Get TwilioWebhooks where sentFollowUpMessage is false
        const newLeads = await getLeadNotSentFollowUpMessage()

        console.info({ newLeads })

        if (!newLeads.length) {
            return NextResponse.json({ ok: false });
        }

        const account = await getZohoAccount({ studioId: newLeads[0].Studio?.id });


        const mobileNumbers = newLeads.map((lead) => formatMobile(lead?.mobile));


        const searchQuery = `(Mobile:in:${mobileNumbers.join(',')})`

        // Encode the search query
        const encodedSearchQuery = encodeURIComponent(searchQuery);

        const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
        const zohoResponse = await axios.get(
            `https://www.zohoapis.com/crm/v5/Leads/search?fields=${fields}&criteria=${encodedSearchQuery}`,
            {
                headers: { Authorization: `Zoho-oauthtoken ${account?.accessToken}` },
            }
        );
        console.info({ zohoResponse: zohoResponse.data.data })




        for (const zohoLead of zohoResponse.data.data) {
            if (zohoLead.id != "5114699000054119007") {
                console.info("NOT YOU")
                continue;
            }
            const { Mobile } = zohoLead;
            const studio = await getStudioFromZohoId(zohoLead.Owner.id)

            // Send follow-up message via Twilio
            await sendFollowUpMessage({ contact: zohoLead, studioId: studio.id, to: Mobile, from: studio.smsPhone });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        // logError({ message: 'Error in cron', error, level: 'error' });
        console.log(error.message)
        return NextResponse.json({ ok: false });
    }
}


async function getLeadNotSentFollowUpMessage() {
    return await prisma.zohoWebhook.findMany({
        where: {
            twilioMessageId: null,
            createdAt: {
                gt: new Date(new Date().getTime() - 6 * 60 * 60 * 1000),
            }
        },
        select: {
            id: true,
            firstName: true,
            mobile: true,
            sentFollowUpMessage: true,
            Studio: {
                select: {
                    id: true,
                    smsPhone: true,
                },
            },
        },
        orderBy: {
            createdAt: 'desc'
        }

    });
}

// function arePhoneNumbersSame(phoneNumber1, phoneNumber2) {
//     return formatMobile(phoneNumber1) === formatMobile(phoneNumber2);
// }

const formatMobile = (mobile) => {
    return mobile.replace(/\D/g, '').trim().slice(-10);
}