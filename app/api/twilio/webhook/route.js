import { createTask } from '~/actions/zoho/tasks';
import { prisma } from '~/utils/prisma';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { logError } from '~/utils/logError';
import { formatMobile } from '~/utils';
import { getStudioFromPhoneNumber, getStudioFromZohoId } from '~/actions/zoho/studio';
import { sendFollowUp } from '~/actions/zoho/sendFollowUp';

// export const runtime = 'edge'; // 'nodejs' is the default
// export const dynamic = 'force-dynamic'; // static by default, unless reading the request

// POST request that receives a Twilio message sent to a studio
// Parses the message
// Finds the studio associated with the message
// We make sure the message is created in the database
// Finds the contact associated with the message
// If there is no contact we either send a follow up message or create a message
// If the number is the admin number, we use the contact's owner as the studio
// If the message is yes, we update the status of the lead and send a follow up message
// If the message is stop, we opt out of SMS
// If the message is not yes or stop, we create a task and update the message in the database
export async function POST(request) {
  try {
    const body = await parseRequest(request);
    let { to, from, msg } = body;

    // Get the studio of the number messaged
    let studio = await getStudioFromPhoneNumber(to);

    // Create the message record
    const messageId = await createMessage({ body, studio });

    // Find the contact, studioId is used for account.accessToken
    const contact = await lookupContact({
      mobile: from,
      studioId: studio?.id,
    });

    if (!contact) {
      if (isYesMessage(msg)) {
        sendFollowUp({ to: from, from: to });
      }
      return new Response(null, { status: 200 });
    }

    // If to is Admin number then we need to use the contacts owner as the studio
    if (isAdminNumber(to)) {
      studio = await getStudioFromZohoId(contact.Owner?.id);
    }


    // If the message is yes, we need to update the status of the lead and send a follow up message
    if (isYesMessage(msg) && !hasReceivedFollowUpMessage(contact)) {
      await sendFollowUp({ contact, studio });
      return new Response(null, { status: 200 });
    }

    // If the message is stop, we need to opt out of SMS
    if (isStopMessage(msg)) {
      await smsOptOut({ studio, contact });
      return new Response(null, { status: 200 });
    }


    await createTask({
      studioId: studio?.id,
      zohoId: studio?.zohoId,
      contact,
      message: { to, from, msg },
    });

    await updateMessage({ messageId, studio, contact });

  } catch (error) {
    console.error(error);
    const text = await request.text();
    const body = new URLSearchParams(text);
    logError({
      message: 'Error in Twilio Webhook:',
      error,
      level: 'error',
      data: JSON.stringify({ body }),
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
    throw new Error('Invalid Twilio Webhook Message');
  }

  return { to, from, msg, twilioMessageId };
}

const isYesMessage = (msg) => msg.toLowerCase().trim() === 'yes';
const isStopMessage = (msg) => msg.toLowerCase().trim() == 'stop';

const isAdminNumber = (to) => to == process.env.ADMIN_NUMBER;
const updateMessage = async ({ messageId, studio, contact }) => {
  await prisma.message.update({
    where: { id: messageId },
    data: {
      studioId: studio?.id,
      contactId: contact?.id,
    },
  });
};

const hasReceivedFollowUpMessage = async (contact) => {
  const message = await prisma.message.findFirst({
    where: {
      twilioMessageId: {
        not: null
      },
      toNumber: contact?.Mobile,
      isFollowUpMessage: true,
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  return !!message;
}


const createMessage = async ({ body }) => {
  const { to, from, msg, twilioMessageId } = body;

  if (!to || !from || !msg || !twilioMessageId) {
    throw new Error('Invalid Twilio Webhook Message', JSON.stringify({ body }));
  }

  return await prisma.message.create({
    data: {
      fromNumber: from,
      toNumber: to,
      message: msg,
      twilioMessageId,
    },
    select: {
      id: true,
    }
  });
};
