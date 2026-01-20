import { prisma } from '~/utils/prisma';
import { NextResponse } from 'next/server';

import { logError } from '~/utils/logError';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { sendFollowUp } from '~/actions/zoho/sendFollowUp';
import { getStudioFromPhoneNumber } from '~/actions/zoho/studio';


// export const runtime = 'edge'; // 'nodejs' is the default
// export const dynamic = 'force-dynamic'; // static by default, unless reading the request


// GET request that runs the cron job
// Gets the list of messages that did not get sent a follow up message


export async function GET(request) {
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
    const unsentFollowUpMessages = await getUnsentFollowUpMessages();
    console.log('unsentFollowUpMessages', unsentFollowUpMessages)

    if (!unsentFollowUpMessages.length) {
      return NextResponse.json({
        ok: false,
        message: 'No unsent follow up messages',
      });
    }

    const followUpPromises = unsentFollowUpMessages.map(async (message) => {
      try {
        const studio = await getStudioFromPhoneNumber(message.fromNumber);
        const contact = await lookupContact({ mobile: message.toNumber, studioId: studio?.id });
        await sendFollowUp({
          contact,
          studio,
          from: message.fromNumber,
          to: message.toNumber
        });
        return { status: 'fulfilled' };
      } catch (error) {
        return { status: 'rejected', reason: error };
      }
    });

    const results = await Promise.allSettled(followUpPromises);


    return NextResponse.json({ results });
  } catch (error) {
    logError({ message: 'Error in cron', error, level: 'error' });
    return NextResponse.json({ ok: false });
  }
}

async function getUnsentFollowUpMessages() {
  // FIX #5: Extended lookback from 1 hour to 24 hours
  // This catches messages where contact wasn't found initially but may be indexed now
  return await prisma.message.findMany({
    where: {
      twilioMessageId: {
        equals: null,
      },
      isFollowUpMessage: true,
      createdAt: {
        gt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
      toNumber: true,
      fromNumber: true
    },
  });
}


