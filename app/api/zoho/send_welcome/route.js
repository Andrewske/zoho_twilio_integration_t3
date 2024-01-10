'use server';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
import * as Sentry from '@sentry/node';



export async function POST(request) {

  try {
    const body = await parseRequest(request);

    if (!isValidBody(body)) {
      throw new Error('Invalid body');
    }

    const zohoWebhookId = await postWebhookData(body);

    let { leadId, ownerId, mobile, firstName } = body;

    mobile = formatMobileNumber(mobile);

    const studio = await getStudioFromZohoId(ownerId);
    if (!studio.active) return new Response(null, { status: 200 });
    const contact = {
      id: leadId,
      fullName: firstName,
      mobile,
      smsOptOut: false,
      isLead: true,
    };

    if (studio.smsPhone) {
      const message = createMessage(firstName, studio);
      await sendAndLogMessage(mobile, studio, message, zohoWebhookId, contact);
    } else {
      throw new Error('Can find studio sms phone')
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    Sentry.captureException(error);
    return new Response(null, { status: 200 })
  }
}

async function postWebhookData(body) {
  return prisma.zohoWebhook.create({
    data: {
      contactId: body.leadId,
      studioZohoId: body.ownerId,
      firstName: body.firstName,
      mobile: body.mobile
    },
  }).then(({ id }) => id);
}

function formatMobileNumber(mobile) {
  if (mobile.startsWith('+1')) {
    return mobile.substring(2);
  }
  return mobile;
}

function createMessage(first_name, { name: studioName, callPhone, managerName }) {
  return `Hi ${first_name}! This is ${managerName} with ` +
    `Fred Astaire Dance Studios - ${studioName}. ` +
    `We would love to get you scheduled for your introductory Program! ` +
    `We have limited space for new clients. ` +
    `Reply "YES" to book your first lesson! ` +
    `Or call us at ${callPhone ?? ''}. ` +
    `If you need to opt-out, reply "STOP"`;
}

async function sendAndLogMessage(mobile, { smsPhone, id: studioId }, message, zohoWebhookId, contact) {
  const response = await sendMessage({
    to: mobile,
    from: smsPhone,
    message,
    studioId,
    contact
  });

  if (response?.error) {
    console.log("No message Id", response.error)
    throw new Error(response.error);
  }

  await prisma.zohoWebhook.update({
    where: { id: zohoWebhookId },
    data: { twilioMessageId: response?.twilioMessageId, sentWelcomeMessage: true },
  });
}

export async function parseRequest(request) {
  try {
    const body = await request.text();
    return parse(body);
  } catch (error) {
    console.error('Error parsing request:', error);
    throw new Error('Error parsing request');
  }
}

export async function isValidBody(body) {
  return Boolean(
    body &&
    body.leadId &&
    body.ownerId &&
    body.mobile &&
    body.firstName
  );
}

export async function getStudioFromZohoId(owner_id) {
  try {
    const studio = await prisma.studio.findFirst({
      where: { zohoId: owner_id },
      select: { id: true, zohoId: true, smsPhone: true, callPhone: true, name: true, managerName: true, active: true },
    });
    return studio;
  } catch (error) {
    console.error({ message: 'Could not find studio', owner_id });
    throw new Error('Could not find studio');
  }
}
