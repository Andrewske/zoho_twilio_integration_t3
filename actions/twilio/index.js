'use server';
import twilio from 'twilio';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';

export const getTwilioAccount = async (id) => {
  try {
    const studioAccounts = await prisma.studioAccount.findMany({
      where: {
        studioId: id,
      },
      include: {
        Account: true,
      },
    });

    const twilioAccount = studioAccounts
      .map((sa) => sa.Account)
      .find((account) => account.platform === 'twilio');

    return twilioAccount;
  } catch (error) {
    logError({
      message: 'Error getting Twilio account',
      error,
      level: 'error',
      data: { id },
    });
    throw error;
  }
};

const getTwilioClient = ({ clientId, clientSecret }) =>
  twilio(clientId, clientSecret, { region: 'US1', edge: 'umatilla' });

export const getMessagesToContact = async (client, contactMobile) => {
  try {
    const response = await client.messages.list({ to: contactMobile });
    return response.map((message) => ({
      to: message.to,
      from: message.from,
      body: message.body,
      date: message.dateSent,
      fromStudio: true,
    }));
  } catch (error) {
    logError({
      message: 'Error getting messages to contact',
      error,
      level: 'info',
      data: { contactMobile },
    });
    throw error;
  }
};

export const getMessagesFromContact = async (client, contactMobile) => {
  try {
    const response = await client.messages.list({ from: contactMobile });
    return response.map((message) => ({
      to: message.to,
      from: message.from,
      body: message.body,
      date: message.dateSent,
      fromStudio: false,
    }));
  } catch (error) {
    logError({
      message: 'Error getting messages from contact',
      error,
      level: 'info',
      data: { contactMobile },
    });
    throw error;
  }
};

export const getMessages = async ({ contactMobile, studioId }) => {
  try {
    const twilioAccount = await getTwilioAccount(studioId);

    if (!twilioAccount) {
      throw new Error('Could not find Twilio account');
    }
    const client = getTwilioClient(twilioAccount);
    const messagesToContact = await getMessagesToContact(client, contactMobile);
    const messagesFromContact = await getMessagesFromContact(
      client,
      contactMobile
    );

    return [...messagesToContact, ...messagesFromContact].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
  } catch (error) {
    logError({
      message: 'Error getting messages',
      error,
      level: 'warning',
      data: { contactMobile, studioId },
    });
    throw error;
  }
};

// Create a route to send a new text message
export const sendMessage = async ({
  to,
  from,
  message,
  studioId,
  contact,
  messageId = null,
}) => {
  const twilioAccount = await getTwilioAccount(studioId);

  if (contact?.SMS_Opt_Out) {
    throw new Error('Contact has opted out of SMS');
  }

  if (!twilioAccount) {
    throw new Error('Could not find Twilio account');
  }

  const client = getTwilioClient(twilioAccount);

  try {
    const sendRecord = await client.messages.create({
      body: message,
      from,
      to,
    });

    if (!sendRecord.sid) {
      throw new Error('Could not send message');
    }

    if (!messageId) {
      await prisma.message.create({
        data: {
          studioId,
          contactId: contact?.id,
          fromNumber: from,
          toNumber: to,
          message,
          twilioMessageId: sendRecord.sid,
        },
      });
    }

    return { twilioMessageId: sendRecord.sid };
  } catch (error) {
    logError({
      message: 'Error sendMessage:',
      error,
      level: 'error',
      data: { to, from, message, studioId },
    });
  }
};
