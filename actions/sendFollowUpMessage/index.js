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

  const { twilioMessageId } = await sendMessage({
    to,
    from,
    message: followUpMessage,
    studioId,
    contact,
    messageId: message?.id,
  });

  if (twilioMessageId) {
    await prisma.message.update({
      where: {
        id: message?.id,
      },
      data: {
        twilioMessageId,
      },
    });
  } else {
    throw new Error('Could not send follow up message');
  }
};

export default sendFollowUpMessage;

const findOrCreateMessage = async ({ contact, from, to, studioId }) => {
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
  return message;
};
