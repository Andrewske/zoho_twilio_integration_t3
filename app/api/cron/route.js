import { prisma } from '~/utils/prisma';
import { NextResponse } from 'next/server';

import { getZohoAccount } from '~/actions/zoho';
import { logError } from '~/utils/logError';
import { formatMobile } from '~/utils';

// export const runtime = 'edge'; // 'nodejs' is the default
// export const dynamic = 'force-dynamic'; // static by default, unless reading the request

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

    await convertNotSentYesMessages();


    const unsentFollowUpMessages = await getLeadNotSentFollowUpMessage();
    console.info('unsentFollowUpMessages:', unsentFollowUpMessages);

    if (!unsentFollowUpMessages.length) {
      return NextResponse.json({
        ok: false,
        message: 'No unsent follow up messages',
      });
    }

    const account = await getZohoAccount({
      studioId: unsentFollowUpMessages[0].Studio?.id,
    });

    if (!account) {
      return NextResponse.json({ ok: false, message: 'No Zoho account' });
    }

    const mobileNumbers = unsentFollowUpMessages.map((lead) =>
      formatMobile(lead?.toNumber)
    );

    const searchQuery = `(Mobile:in:${mobileNumbers.join(',')})`;

    // Encode the search query
    const encodedSearchQuery = encodeURIComponent(searchQuery);

    const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
    const response = await fetch(
      `https://www.zohoapis.com/crm/v5/Leads/search?fields=${fields}&criteria=${encodedSearchQuery}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${account?.accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Request failed with status code ${response.status}`);
    }

    let zohoResponse;
    try {
      zohoResponse = await response.json();
    } catch (error) {
      console.error(response);
    }

    for (const zohoLead of zohoResponse.data) {
      if (zohoLead.id != '5114699000054215028') {
        console.info('Skipping lead', zohoLead.id);
        continue;
      }
      const { Mobile, Owner } = zohoLead;
      const studio = await getStudioFromZohoId(Owner?.id);

      const followUp = await fetch(
        `${process.env.SERVER_URL}/api/twilio/send_follow_up`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contact: zohoLead,
            from: studio.smsPhone,
            to: Mobile,
            studioId: studio.id,
          }),
        }
      );

      if (!followUp.ok) {
        const errorData = await followUp.json();
        console.error({ errorData });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error.message);
    logError({ message: 'Error in cron', error, level: 'error' });
    return NextResponse.json({ ok: false });
  }
}

async function convertNotSentYesMessages() {
 return await prisma.message.updateMany({
    where: {
      twilioMessageId: null,
      createdAt: {
        gt: new Date(new Date().getTime() - 1 * 60 * 60 * 1000),
      },
      message: {
        equalsIgnoreCase: 'yes'
      }
    },
    data: {
      isFollowUpMessage: true
    }
  })
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
  });
}

export async function getStudioFromZohoId(owner_id) {
  try {
    const studio = await prisma.studio.findFirst({
      where: { zohoId: owner_id },
      select: {
        id: true,
        zohoId: true,
        smsPhone: true,
        callPhone: true,
        name: true,
        managerName: true,
        active: true,
      },
    });
    return studio;
  } catch (error) {
    throw new Error('Could not find studio');
  }
}
