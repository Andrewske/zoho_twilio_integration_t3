'use server';
import twilio from 'twilio';
import prisma from '~/utils/prisma';
import * as Sentry from "@sentry/nextjs";

export const getTwilioAccount = async (id) => {
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
};

const getTwilioClient = ({ clientId, clientSecret }) => twilio(clientId, clientSecret);

export const getMessagesToContact = async (client, leadPhoneNumber) => {
  const response = await client.messages.list({ to: leadPhoneNumber });
  return response.map((message) => ({
    to: message.to,
    from: message.from,
    body: message.body,
    date: message.dateSent,
    fromStudio: true,
  }));
};

export const getMessagesFromContact = async (client, leadPhoneNumber) => {
  const response = await client.messages.list({ from: leadPhoneNumber });
  return response.map((message) => ({
    to: message.to,
    from: message.from,
    body: message.body,
    date: message.dateSent,
    fromStudio: false,
  }));
};

export const getMessages = async ({ leadPhoneNumber, studioId }) => {
  const twilioAccount = await getTwilioAccount(studioId);

  if (!twilioAccount) {
    throw new Error('Could not find Twilio account');
  }

  const client = getTwilioClient(twilioAccount);

  const messagesToContact = await getMessagesToContact(client, leadPhoneNumber);
  const messagesFromContact = await getMessagesFromContact(client, leadPhoneNumber);

  return [...messagesToContact, ...messagesFromContact].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
};


// Create a route to send a new text message
export const sendMessage = async ({ to, from, message, studioId }) => {
  const twilioAccount = await getTwilioAccount(studioId);

  if (!twilioAccount) {
    console.error('Could not find Twilio account');
    return;
  }

  const client = getTwilioClient(twilioAccount);

  try {
    await client.messages.create({
      body: message,
      from,
      to,
    });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
};