import { prisma } from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
import { logError } from '~/utils/logError';
import { formatMobile } from '~/utils';

export async function POST(request) {
  try {
    const { leadId, ownerId, mobile, firstName } = await parseRequest(request);
    const studio = await getStudioFromZohoId(ownerId);

    console.log(studio)

    if (!studio.active) return new Response(null, { status: 200 });

    const contact = {
      id: leadId,
      fullName: firstName,
      mobile,
      smsOptOut: false,
      isLead: true,
    };
    
    const zohoWebhookId = await findOrCreateWelcomeMessage({
      contact,
      from: studio.smsPhone,
      to: mobile,
      studioId: studio.id,
    });

    if (!zohoWebhookId) return new Response(null, { status: 200 });

    if (studio.smsPhone) {
      const message = createMessage(firstName, studio);
      await sendAndLogMessage(mobile, studio, message, zohoWebhookId, contact);
    } else {
      throw new Error('Can find studio sms phone');
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    logError({
      message: 'Error in send welcome',
      error,
      level: 'error',
      data: {},
    });
    return new Response(null, { status: 200 });
  }
}

function createMessage(
  first_name,
  { name: studioName, callPhone, managerName }
) {
  return (
    `Hi ${first_name}! This is ${managerName} with ` +
    `Fred Astaire Dance Studios - ${studioName}. ` +
    `I would love to get you scheduled for your Introductory Program! ` +
    `We have limited space for new clients. ` +
    `Reply "YES" to book your first lesson! ` +
    `Or call us at ${callPhone ?? ''}. ` +
    `If you need to opt-out, reply "STOP"`
  );
}

async function sendAndLogMessage(
  mobile,
  { smsPhone, id: studioId },
  message,
  zohoWebhookId,
  contact
) {
  try {
    const response = await sendMessage({
      to: mobile,
      from: smsPhone,
      message,
      studioId,
      contact,
      messageId: zohoWebhookId,
    });

    await prisma.message.update({
      where: { id: zohoWebhookId },
      data: {
        twilioMessageId: response?.twilioMessageId,
      },
    });
  } catch (error) {
    logError({
      message: 'Error sendAndLogMessagee:',
      error,
      level: 'error',
      data: { to: mobile, from: smsPhone, message, studioId },
    });
  }
}

export async function parseRequest(request) {
  const text = await request.text();
  const body = new URLSearchParams(text);
  const leadId = body.get('leadId');
  const ownerId = body.get('ownerId');
  const mobile = formatMobile(body.get('mobile'));
  const firstName = body.get('firstName');

  if (!leadId || !ownerId || !mobile || !firstName) {
    throw new Error('Invalid Zoho Webhook Message');
  }

  return { leadId, ownerId, mobile, firstName };
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
    logError({
      message: 'Could not find studio',
      error,
      level: 'warning',
      data: { owner_id },
    });
    throw new Error('Could not find studio');
  }
}

const findOrCreateWelcomeMessage = async ({ contact, from, to, studioId }) => {
  let message = await prisma.message.findFirst({
    where: {
      toNumber: to,
      isWelcomeMessage: true,
    },
    select: {
      id: true,
      twilioMessageId: true,
    },
  });

  if (message?.twilioMessageId) {
    console.log('Welcome message already sent');
    return null;
  }

  // If the record doesn't exist, create it
  if (!message) {
    message = await prisma.message.create({
      data: {
        contactId: contact?.id,
        studioId: studioId,
        fromNumber: from,
        toNumber: to,
        isWelcomeMessage: true,
      },
    });
  }
  return message.id;
};
