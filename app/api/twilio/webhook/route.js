'use server';
import { createTask } from '~/actions/zoho/tasks';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateStatus } from '~/actions/zoho/contact/updateStatus';
import { logError } from '~/utils/logError';
import sendFollowUpMessage from '~/actions/sendFollowUpMessage';

export async function POST(request) {
  var STOP = false;

  try {
    let message = await parseRequest(request);

    if (!isValidMessage(message)) {
      throw new Error('Invalid Twilio Webhook Message');
    }


    const to = formatMobile(message.To);
    const from = formatMobile(message.From);
    const msg = message.Body;


    // console.log(JSON.stringify({ to, from, msg }));

    // if (to.startsWith('+1')) {
    //   to = to.substring(2);
    // }
    // if (from.startsWith('+1')) {
    //   from = from.substring(2);
    // }

    if (msg.toLowerCase().includes('stop')) {
      STOP = true;
    }

    const studioInfo = await getStudioInfo(to);

    if (!studioInfo) {
      throw new Error('Could not find studio');
    }

    const contact = await lookupContact({
      mobile: from,
      studioId: studioInfo.id,
    });

    if (
      contact.isLead &&
      contact.Lead_Status == 'New' &&
      msg.toLowerCase().includes('yes')
    ) {
      updateStatus({ studio: studioInfo, contact });
      sendFollowUpMessage({ contact, from: studioInfo.smsPhone, to: contact.Mobile, studioId: studioInfo?.id });
    }

    // TODO: make sure cleaned to and from values are being sent to postWebhookData
    await postWebhookData({
      message,
      studioId: studioInfo.id,
      contactId: contact.id,
    });

    // await prisma.message.create({
    //   data: {
    //     studioId: studioInfo.id,
    //     contactId: contact.id,
    //     from,
    //     to,
    //     message: msg
    //   },
    // })

    if (STOP) {
      await smsOptOut({ studio: studioInfo, contact });
    } else {
      await createTask({
        studioId: studioInfo.id,
        zohoId: studioInfo.zohoId,
        contact,
        message: { to, from, msg },
      });
    }
  } catch (error) {
    logError({ message: 'Error in Twilio Webhook:', error, level: 'error', data: {} });
  }
  return new Response(null, { status: 200 });
}

async function postWebhookData({ message, studioId, contactId }) {
  return prisma.twilioMessage
    .create({
      data: {
        studioId,
        contactId,
        from: message.From,
        to: message.To,
        message: message.Body,
        twilioMessageId: message?.MessageSid,
      },
    })
    .then(({ id }) => id);
}

export async function parseRequest(request) {
  try {
    const body = await request.text();
    return parse(body);
  } catch (error) {
    logError({
      message: 'Error parsing request:',
      error,
      level: 'warning'
    });
  }
}

export async function isValidMessage(message) {
  return Boolean(message && message.to && message.from && message.msg);
}

export async function getStudioInfo(to) {
  try {
    return await prisma.studio.findFirst({
      where: { smsPhone: to },
      select: { id: true, zohoId: true, smsPhone: true },
    });
  } catch (error) {
    logError({
      message: 'Could not find studio',
      error,
      level: 'warning',
      data: { to },
    });
  }
}


const formatMobile = (mobile) => {
  return mobile.replace(/\D/g, '').trim().slice(-10);
}