import prisma from '~/utils/prisma';
import axios from 'axios';
import { NextResponse } from 'next/server';

// import { logError } from '~/utils/logError';
import { getZohoAccount } from '~/actions/zoho';

import sendFollowUpMessage from '~/actions/sendFollowUpMessage';
import { getStudioFromZohoId } from '../zoho/send_welcome/route';
import { logError } from '~/utils/logError';

export async function GET(request) {
  console.log('CRON STARTED');
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
    // Get follow up messages that were not sent
    const unsentFollowUpMessages = await getLeadNotSentFollowUpMessage();
    console.log('unsentFollowUpMessages:', unsentFollowUpMessages);

    if (!unsentFollowUpMessages.length) {
      return NextResponse.json({ ok: false });
    }

    const account = await getZohoAccount({
      studioId: unsentFollowUpMessages[0].Studio?.id,
    });

    const mobileNumbers = unsentFollowUpMessages.map((lead) =>
      formatMobile(lead?.toNumber)
    );

    const searchQuery = `(Mobile:in:${mobileNumbers.join(',')})`;

    // Encode the search query
    const encodedSearchQuery = encodeURIComponent(searchQuery);

    const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
    const zohoResponse = await axios.get(
      `https://www.zohoapis.com/crm/v5/Leads/search?fields=${fields}&criteria=${encodedSearchQuery}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${account?.accessToken}` },
      }
    );

    for (const zohoLead of zohoResponse.data.data) {
      if (zohoLead.id != '5114699000054119007') {
        logError({
          message: 'Cron tried to send a follow up message',
          error: new Error('Not the right lead'),
          level: 'info',
          data: { zohoLead },
        });
        continue;
      }
      const { Mobile } = zohoLead;
      const studio = await getStudioFromZohoId(zohoLead?.Owner?.id);

      // Send follow-up message via Twilio
      await sendFollowUpMessage({
        contact: zohoLead,
        studioId: studio.id,
        to: Mobile,
        from: studio.smsPhone,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError({ message: 'Error in cron', error, level: 'error' });
    console.log(error.message);
    return NextResponse.json({ ok: false });
  }
}

async function getLeadNotSentFollowUpMessage() {
  return await prisma.message.findMany({
    where: {
      twilioMessageId: null,
      isFollowUpMessage: true,
      createdAt: {
        gt: new Date(new Date().getTime() - 1 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
      toNumber: true,
      Studio: {
        select: {
          id: true,
          smsPhone: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

const formatMobile = (mobile) => {
  return mobile.replace(/\D/g, '').trim().slice(-10);
};
