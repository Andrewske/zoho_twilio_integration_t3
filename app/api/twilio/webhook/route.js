import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { sendFollowUp } from '~/actions/zoho/sendFollowUp';
import { getStudioFromPhoneNumber, getStudioFromZohoId } from '~/actions/zoho/studio';
import { createTask } from '~/actions/zoho/tasks';
import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';

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
  let messageId = null;

  try {
    const body = await parseRequest(request);
    let { to, from, msg } = body;

    // Get the studio of the number messaged
    let studio = await getStudioFromPhoneNumber(to);

    // FIX #1: Save message IMMEDIATELY - before any Zoho calls
    // This ensures we never lose incoming messages even if contact lookup fails
    messageId = await createMessage({ body, studio });

    // Find the contact, studioId is used for account.accessToken
    const contact = await lookupContact({
      mobile: from,
      studioId: studio?.id,
    });

    if (!contact) {
      // Message is now saved! Return 500 for Twilio retry.
      // On retry, contact should be indexable in Zoho.
      return new Response('contact not found', { status: 500, headers: { 'Retry-After': '60' } });
    }

    // If to is Admin number then we need to use the contacts owner as the studio
    if (isAdminNumber(to)) {
      console.log('admin number', contact.Owner?.id)
      studio = await getStudioFromZohoId(contact.Owner?.id);
    }

    // FIX #2: Update message with studioId/contactId IMMEDIATELY after contact lookup
    // This ensures ALL messages (including yes messages) get proper attribution
    await updateMessage({ messageId, studio, contact });

    // If the message is yes, we need to update the status of the lead and send a follow up message
    if (isYesMessage(msg) && !(await hasReceivedFollowUpMessage(contact))) {
      await sendFollowUp({ contact, studio, to: from, from: to, msg });
      return new Response(null, { status: 200 });
    }

    // If the message is stop, we need to opt out of SMS
    if (isStopMessage(msg)) {
      await smsOptOut({ studio, contact });
      return new Response(null, { status: 200 });
    }

    const taskData = await createTask({
      studioId: studio?.id,
      zohoId: studio?.zohoId,
      contact,
      message: { to, from, msg },
    });

    // Store the ZohoTask record if task was created successfully
    if (taskData?.zohoTaskId) {
      await prisma.zohoTask.create({
        data: {
          zohoTaskId: taskData.zohoTaskId,
          messageId: messageId,
          studioId: studio?.id,
          contactId: taskData.contactId,
          taskSubject: taskData.taskSubject,
          taskStatus: taskData.taskStatus,
        },
      });
    }

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(error);
    logError({
      message: 'Error in Twilio Webhook:',
      error,
      level: 'error',
      data: { messageId },
    });
    // FIX #4: Return 500 for transient errors so Twilio retries
    return new Response('Internal error', { status: 500, headers: { 'Retry-After': '120' } });
  }
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
      toNumber: formatMobile(contact?.Mobile),
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

  const { id } = await prisma.message.create({
    data: {
      fromNumber: formatMobile(from),
      toNumber: formatMobile(to),
      message: msg,
      twilioMessageId,
    },
    select: {
      id: true,
    }
  });

  return id
};
