import prisma from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
// import { logError } from '~/utils/logError';

const sendFollowUpMessage = async ({ contact, from, to, studioId }) => {
  const followUpMessage =
    'Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?';

  let message = await findOrCreateMessage({ contact, from, to, studioId });

  if (!message) {
    throw new Error('Could not find or create message');
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

  if (message.id && response.twilioMessageId) {
    await prisma.message.update({
      where: {
        id: message.id,
      },
      data: {
        twilioMessageId: response.twilioMessageId,
      },
    });
  } else {
    throw new Error('Could not send follow up message');
  }
};

export default sendFollowUpMessage;

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

    console.log({ message });

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
