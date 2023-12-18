'use server';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';


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

    if (studio.smsPhone) {
      const message = createMessage(firstName, studio);
      await sendAndLogMessage(mobile, studio, message, zohoWebhookId);
    } else {
      throw new Error('Can find studio sms phone')
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return new Response(null, { status: 500 });
  }
}

async function postWebhookData(body) {
  return prisma.zohoWebhook.create({
    data: {
      contactId: body.leadId,
      studioZohoId: body.ownerId,
      firstName: body.firstName,
      mobile: body.mobile,
      body: JSON.stringify(body),
    },
  }).then(({ id }) => id);
}

function formatMobileNumber(mobile) {
  if (mobile.startsWith('+1')) {
    return mobile.substring(2);
  }
  return mobile;
}

function createMessage(first_name, { name: studioName, callPhone }) {
  return `Hi ${first_name}, it's Kevin at ` +
    `Fred Astaire Dance Studios - ${studioName}. ` +
    `Would you like to schedule your 2 Intro Lessons? ` +
    `If you would like to schedule a lesson, reply "YES" ` +
    `or call us at ${callPhone ?? ''}. ` +
    `If you need to opt-out, reply "STOP"`;
}

async function sendAndLogMessage(mobile, { smsPhone, id: studioId }, message, zohoWebhookId) {
  const messageId = await sendMessage({
    to: mobile,
    from: smsPhone,
    message,
    studioId,
  });

  if (!messageId) {
    throw new Error('Could not send message');
  }

  await prisma.zohoWebhook.update({
    where: { id: zohoWebhookId },
    data: { twilioMessageId: messageId, sentWelcomeMessage: true },
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
      select: { id: true, zohoId: true, smsPhone: true, callPhone: true, name: true },
    });
    console.log({ studio })
    return studio;
  } catch (error) {
    console.error({ message: 'Could not find studio', owner_id });
    console.error(error.message);
  }
}
