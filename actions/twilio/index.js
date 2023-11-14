'use server';
import twilio from 'twilio';
import prisma from '~/utils/prisma';
import * as Sentry from "@sentry/nextjs";

export const getTwilioAccount = async (id) => {
  console.log({ id })
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

export const getMessages = async ({ leadPhoneNumber, studioId }) => {
  console.log({ leadPhoneNumber, studioId })
  const twilioAccount = await getTwilioAccount(studioId);

  if (twilioAccount) {
    const { clientId, clientSecret } = twilioAccount;
    try {
      const client = twilio(clientId, clientSecret);

      const responseToContact = await client.messages.list({
        to: leadPhoneNumber,
      });

      const messagesToContact = responseToContact.map((message) => ({
        to: message.to,
        from: message.from,
        body: message.body,
        date: message.dateSent,
        fromStudio: true,
      }));

      const responseFromContact = await client.messages.list({
        from: leadPhoneNumber,
      });

      const messagesFromContact = responseFromContact.map((message) => ({
        to: message.to,
        from: message.from,
        body: message.body,
        date: message.dateSent,
        fromStudio: false,
      }));

      const messages = [...messagesToContact, ...messagesFromContact].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );
      return messages;
    } catch (error) {
      console.error(error);
      return null;
    }
  } else {
    console.error('Cound not find twilio account');
    return null;
  }
};


// Create a route to send a new text message
export const sendMessage = async ({ to, from, message, studioId }) => {
  const twilioAccount = await getTwilioAccount(studioId);

  if (twilioAccount) {
    const { clientId, clientSecret } = twilioAccount;
    try {
      const client = twilio(clientId, clientSecret);

      await client.messages.create({
        body: message,
        from,
        to,
      });
      return;
    } catch (error) {
      Sentry.captureException(error);
      throw new Error(error);
    }
  }
};
