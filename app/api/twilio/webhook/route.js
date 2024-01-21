'use server';
import { createTask } from '~/actions/zoho/tasks';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateStatus } from '~/actions/zoho/contact/updateStatus';
import { logError } from '~/utils/logError';
import sendFollowUpMessage from '~/actions/sendFollowUpMessage';
import { formatMobile } from '~/utils';

export async function POST(request) {
  try {
    let { to, from, msg, twilioMessageId } = await parseRequest(request);

    const { id: messageId } = await prisma.message.create({
      data: {
        fromNumber: from,
        toNumber: to,
        message: msg,
        twilioMessageId,
      },
      select: {
        id: true,
      },
    });

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
      updateStatus({ studio: studioInfo, contact });
      sendFollowUpMessage({
        contact,
        from: studioInfo.smsPhone,
        to: contact.Mobile,
        studioId: studioInfo?.id,
      });
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
  const body = parse(text);
  const to = formatMobile(body?.To);
  const from = formatMobile(body?.From);
  const msg = body?.Body;
  const twilioMessageId = body?.MessageSid;

  if (!to || !from || !msg || !twilioMessageId) {
    console.log({ body });
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
