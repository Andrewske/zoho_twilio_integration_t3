import { createTask } from '~/actions/zoho/tasks';
import prisma from '~/utils/prisma';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateStatus } from '~/actions/zoho/contact/updateStatus';
import { logError } from '~/utils/logError';
import { formatMobile } from '~/utils';

export const runtime = 'edge'; // 'nodejs' is the default
export const dynamic = 'force-dynamic'; // static by default, unless reading the request

export async function POST(request) {
  try {
    let { to, from, msg, twilioMessageId } = await parseRequest(request);

    console.log({ to, from, msg, twilioMessageId });

    const messageId = await prisma.message
      .create({
        data: {
          fromNumber: from,
          toNumber: to,
          message: msg,
          twilioMessageId,
        },
        select: {
          id: true,
        },
      })
      .then(({ id }) => id);

    console.log({ messageId });

    if (!messageId) {
      throw new Error('Could not create message');
    }

    const studioInfo = await getStudioInfo(to);

    const contact = await lookupContact({
      mobile: from,
      studioId: studioInfo?.id,
    });

    const STOP = msg.toLowerCase().trim() == 'stop';
    if (STOP) {
      await smsOptOut({ studio: studioInfo, contact });
      return new Response(null, { status: 200 });
    }

    const YES = msg.toLowerCase().includes('yes');
    if (contact.isLead && contact.Lead_Status == 'New' && YES) {
      console.log('Updating status');
      updateStatus({ studio: studioInfo, contact });
      const followUp = await fetch(
        `${process.env.SERVER_URL}/api/twilio/send_follow_up`,
        {
          method: 'POST', // or 'PUT'
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contact,
            from: studioInfo.smsPhone,
            to: contact.Mobile,
            studioId: studioInfo?.id,
          }),
        }
      );

      if (!followUp.ok) {
        const errorData = await followUp.json();
        console.error({ errorData });
      }
    } else {
      console.log({ contact, YES });
    }

    await createTask({
      studioId: studioInfo.id,
      zohoId: studioInfo.zohoId,
      contact,
      message: { to, from, msg },
    });

    await prisma.message.update({
      where: { id: messageId },
      data: {
        studioId: studioInfo?.id,
        contactId: contact?.id,
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
  }
  return new Response(null, { status: 200 });
}

export async function parseRequest(request) {
  const text = await request.text();
  const body = new URLSearchParams(text);
  const to = formatMobile(body.get('To'));
  const from = formatMobile(body.get('From'));
  const msg = body.get('Body');
  const twilioMessageId = body.get('MessageSid');

  if (!to || !from || !msg || !twilioMessageId) {
    console.info({ body });
    throw new Error('Invalid Twilio Webhook Message');
  }

  return { to, from, msg, twilioMessageId };
}

export async function getStudioInfo(to) {
  const studio = await prisma.studio.findFirst({
    where: { smsPhone: to },
    select: { id: true, zohoId: true, smsPhone: true },
  });

  if (!studio) {
    throw new Error('Could not find studio');
  }

  return studio;
}
