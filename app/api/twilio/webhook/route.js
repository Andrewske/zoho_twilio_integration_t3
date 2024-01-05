'use server';
import { createTask } from '~/actions/zoho/tasks';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateStatus } from '~/actions/zoho/contact/updateStatus';
import { sendMessage } from '~/actions/twilio';
import { logError } from "~/utils/logError"

export async function POST(request) {
  var STOP = false;

  try {
    let message = await parseRequest(request);

    if (!isValidMessage(message)) {
      throw new Error('Invalid Twilio Webhook Message');
    }

    let { To: to, From: from, Body: msg } = message;
    console.log({ to, from, msg })

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

    const contact = await lookupContact({ mobile: from, studioId: studioInfo.id, retry: true });

    if (contact.isLead && contact.Lead_Status == 'New' && msg.toLowerCase().includes('yes')) {
      updateStatus({ studio: studioInfo, contact })

      await sendFollowUpMessage({ contact, from, to, studioInfo })


    }
    // TODO: make sure cleaned to and from values are being sent to postWebhookData
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
    console.error('Error in Twilio Webhook:', error);
    throw new Error('Webhook error')
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
    logError({ message: 'Error parsing request:', error, level: "warning", data: { request } })
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
    logError({ message: 'Could not find studio', error, level: "warning", data: { to } })
  }
}


async function sendFollowUpMessage({ contact, from, to, studioInfo }) {
  try {
    const welcomeMessageRecord = await prisma.zohoWebhook.findFirst({
      where: { contactId: contact.id, sentWelcomeMessage: true }
    })

    if (!welcomeMessageRecord) {
      const followUpMessage = "Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?"
      const response = await sendMessage({ to: from, from: to, message: followUpMessage, studioId: studioInfo.id, contact })
      if (response.error) {
        throw new Error(response.error)
      }
    }
  } catch (error) {
    logError({ message: 'Error sending follow up message:', error, level: "warning", data: { contactId: contact?.id, from, to, studioId: studioInfo?.zohoId } })
  }
}
