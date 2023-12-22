'use server';
import { createTask } from '~/actions/zoho/tasks';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateStatus } from '~/actions/zoho/contact/updateStatus';

export async function POST(request) {
  var STOP = false;

  try {
    let message = await parseRequest(request);

    if (!isValidMessage(message)) {
      throw new Error('Invalid Twilio Webhook Message');
    }

    let { To: to, From: from, Body: msg } = message;

    if (to.startsWith('+1')) {
      to = to.substring(2);
    }
    if (from.startsWith('+1')) {
      from = from.substring(2);
    }

    if (msg.toLowerCase().includes('stop')) {
      STOP = true;
    }

    const studioInfo = await getStudioInfo(to);

    if (!studioInfo) {
      throw new Error('Could not find studio');
    }

    const contact = await lookupContact({ mobile: from, studioId: studioInfo.id });


    // TODO: If contact.status IS new change to "Contacted, Not Booked"
    if (contact.isLead && contact.Lead_Status == 'New' && msg.toLowerCase().includes('yes')) {
      updateStatus({ studio: studioInfo, contact })
    }

    await postWebhookData({ message, studioId: studioInfo.id, contactId: contact.id })


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
    console.error('Webhook error:', error.message);
    throw new Error('Webhook error', error.message)
  }
  return new Response(null, { status: 200 });
}

async function postWebhookData({ message, studioId, contactId }) {
  return prisma.twilioMessage.create({
    data: {
      studioId,
      contactId,
      from: message.From,
      to: message.To,
      message: message.Body,
      twilioMessageId: message.MessageSid,
    },
  }).then(({ id }) => id);
}

export async function parseRequest(request) {
  try {
    const body = await request.text();
    return parse(body);
  } catch (error) {
    console.error('Error parsing request:', error);
    throw new Error('Error parsing request')
  }
}

export async function isValidMessage(message) {
  return Boolean(message && message.to && message.from && message.msg);
}

export async function getStudioInfo(to) {

  try {
    return await prisma.studio.findFirst({
      where: { smsPhone: to.replace('+1', '') },
      select: { id: true, zohoId: true },
    });
  } catch (error) {
    console.error({ message: 'Could not find studio', to });
    throw new Error('Could not find studio')
  }
}
