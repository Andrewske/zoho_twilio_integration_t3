'use server';
import twilio from 'twilio';
import { logError } from '~/utils/rollbar';
import prisma from '~/utils/prisma';
// const { MessagingResponse } = twilio.twiml;

// const accountSid =
//   process.env.NODE_ENV === 'production'
//     ? process.env.TWILIO_ACCOUNT_SID_FADS
//     : process.env.TWILIO_ACCOUNT_SID_KEV;
// const authToken =
//   process.env.NODE_ENV === 'production'
//     ? process.env.TWILIO_AUTH_TOKEN_FADS
//     : process.env.TWILIO_AUTH_TOKEN_KEV;

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
      logError(error);
      return null;
    }
  } else {
    logError('Cound not find twilio account');
    return null;
  }
};

// Create a route to send a new text message
export const sendMessage = async ({ to, from, message, studioId }) => {
  logError('sendMessage not implemented');
  // const twilioAccount = await getTwilioAccount(studioId);

  // if (twilioAccount) {
  //   const { clientId, clientSecret } = twilioAccount;
  //   try {
  //     const client = twilio(clientId, clientSecret);

  //     await client.messages.create({
  //       body: message,
  //       from,
  //       to,
  //     });
  //     return true;
  //   } catch (error) {
  //     logError(error);
  //     return false;
  //   }
  // }
};
