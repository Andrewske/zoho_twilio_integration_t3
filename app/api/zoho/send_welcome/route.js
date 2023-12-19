'use server';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';


export async function POST(request) {

  try {
    const body = await parseRequest(request);

    if (!isValidBody(body)) {
      throw new Error('Invalid body');
    }

    const zohoWebhookId = await postWebhookData(body);

    let { ownerId, mobile, firstName } = body;

    mobile = formatMobileNumber(mobile);

    const studio = await getStudioFromZohoId(ownerId);
    const contact = await lookupContact({ mobile, studioId: studio.id });

    if (studio.smsPhone) {
      const message = createMessage(firstName, studio);
      await sendAndLogMessage(mobile, studio, message, zohoWebhookId, contact);
    } else {
      throw new Error('Can find studio sms phone')
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return new Response(null, { status: 200 });
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
  return `Hi ${first_name}, it's ${managerName} at ` +
    `Fred Astaire Dance Studios - ${studioName}. ` +
    `Would you like to schedule your 2 Intro Lessons? ` +
    `If you would like to schedule a lesson, reply "YES" ` +
    `or call us at ${callPhone ?? ''}. ` +
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
      select: { id: true, zohoId: true, smsPhone: true, callPhone: true, name: true, managerName: true },
    });
    return studio;
  } catch (error) {
    console.error({ message: 'Could not find studio', owner_id });
    console.error(error.message);
  }
}
