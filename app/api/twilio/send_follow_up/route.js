import prisma from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
import { logError } from '~/utils/logError';

// { contact, from, to, studioId }

const followUpMessage =
  'Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?';

export async function POST(request) {
  console.log('send_follow_up');
  const { contact, from, to, studioId } = await request.json();

  if (!contact || !from || !to || !studioId) {
    return new Response('Missing required parameters', { status: 400 });
  }

  try {
    let message = await findOrCreateMessage({ contact, from, to, studioId });

    if (!message) {
      return new Response('Message already sent', { status: 200 });
    }

    console.log({ message });

    const response = await sendMessage({
      to,
      from,
      message: followUpMessage,
      studioId,
      contact,
      messageId: message?.id,
    });

    console.log({ twilioMessageId: response.twilioMessageId });

    const updatedMessage = await prisma.message.update({
      where: {
        id: message.id,
      },
      data: {
        twilioMessageId: response.twilioMessageId,
      },
    });

    if (!updatedMessage) {
      throw new Error('send_follow_up could not update message');
    }
  } catch (error) {
    logError({
      error,
      message: 'Error api/twilio/send_follow_up',
      level: 'error',
      data: { contact, from, to, studioId },
    });
  }

  return new Response('', { status: 200 });
}

const findOrCreateMessage = async ({ contact, from, to, studioId }) => {
  try {
    let message = await prisma.message.findFirst({
      where: {
        toNumber: to,
        isFollowUpMessage: true,
      },
      select: {
        id: true,
        twilioMessageId: true,
      },
    });

    console.info(message);

    if (message?.twilioMessageId) {
      console.log('Follow up message already sent');
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
          isFollowUpMessage: true,
        },
      });
    }

    console.log({ message });

    return message;
  } catch (error) {
    console.log({ error });
  }
};
