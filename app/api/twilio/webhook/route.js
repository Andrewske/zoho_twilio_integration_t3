import { createTask } from '~/actions/zoho/tasks';
import { prisma } from '~/utils/prisma';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateStatus } from '~/actions/zoho/contact/updateStatus';
import { logError } from '~/utils/logError';
import { formatMobile } from '~/utils';

// export const runtime = 'edge'; // 'nodejs' is the default
// export const dynamic = 'force-dynamic'; // static by default, unless reading the request

export async function POST(request) {
  try {
    const body = await parseRequest(request);

    let { to, from, msg } = body;

    const studio = await getStudioInfo(to);

    const { messageId, followUpMessageId } = await createMessageRecords(
      body,
      studio
    );

    const contact = await lookupContact({
      mobile: from,
      studioId: "cloj98kcn00002z9w53lw8lze",
    });

    if (!contact) {
      return new Response(null, { status: 200 });
    }

    const STOP = msg.toLowerCase().trim() == 'stop';
    if (STOP) {
      await smsOptOut({ studio, contact });
      return new Response(null, { status: 200 });
    }

    const YES = msg.toLowerCase().trim() === 'yes';
    if (contact?.isLead && contact?.Lead_Status == 'New' && YES) {
      updateStatus({ studio, contact });
      sendFollowUp({
        followUpMessageId,
        contact,
        studio,
      });
    }

    await createTask({
      studioId: studio?.id,
      zohoId: studio?.zohoId,
      contact,
      message: { to, from, msg },
    });

    await prisma.message.update({
      where: { id: messageId },
      data: {
        studioId: studio?.id,
        contactId: contact?.id,
      },
    });
  } catch (error) {
    console.error(error);
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
  const body = new URLSearchParams(text);
  const to = formatMobile(body.get('To'));
  const from = formatMobile(body.get('From'));
  const msg = body.get('Body');
  const twilioMessageId = body.get('MessageSid');

  if (!to || !from || !msg || !twilioMessageId) {
    console.info({ body });
    throw new Error('Invalid Twilio Webhook Message');
  }

  return { to, from, msg, twilioMessageId };
}

export async function getStudioInfo(to) {
  try {
    const { DEV_ZOHO_ID, ADMIN_ZOHO_ID } = process.env
    const ignoreIds = [DEV_ZOHO_ID, ADMIN_ZOHO_ID].filter(Boolean)

    const studio = await prisma.studio.findFirst({
      where: { smsPhone: to, zohoId: { notIn: ignoreIds } },
      select: { id: true, zohoId: true, smsPhone: true, active: true },
    });

    if (!studio) {
      throw new Error('Could not find studio');
    }

    if (!studio.active) {
      throw new Error('Studio is not active');
    }

    return studio;
  } catch (error) {
    console.error(error.message);
    return null;
  }
}

const sendFollowUp = async ({ followUpMessageId, contact, studio }) => {
  try {
    const response = await fetch(
      `${process.env.SERVER_URL}/api/twilio/send_follow_up`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contact,
          from: studio.smsPhone,
          to: contact.Mobile,
          studioId: studio.id,
          messageId: followUpMessageId,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Could not send follow up message');
      console.error(JSON.stringify({ errorData }));
    }

    return response;
  } catch (error) {
    console.error('Could not send follow up message');
    console.error(JSON.stringify({ error }));
    logError({
      message: 'Error in createAndSendFollowUp',
      error,
      level: 'error',
      data: { followUpMessageId, contact, studio },
    });
  }
};

const createMessageRecords = async (
  { to, from, msg, twilioMessageId },
  studio
) => {
  let messageData = [
    {
      fromNumber: from,
      toNumber: to,
      message: msg,
      twilioMessageId,
      studioId: studio?.id,
    },
  ];

  const sentFollowUp = prisma.message.findFirst({
    where: {
      fromNumber: to,
      isFollowUpMessage: true,
    },
  });

  const YES = msg.toLowerCase().trim() === 'yes';

  if (YES & !sentFollowUp) {
    messageData.push({
      fromNumber: to,
      toNumber: from,
      isFollowUpMessage: true,
      studioId: studio?.id,
    });
  }

  const [messageId, followUpMessageId] = await Promise.all(
    messageData.map(async (data) => {
      const message = await prisma.message.create({ data });
      return message.id;
    })
  );

  if (!messageId) {
    throw new Error('Could not create message');
  }

  return { messageId, followUpMessageId };
};
