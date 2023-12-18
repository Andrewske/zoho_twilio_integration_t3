'use server';
import twilio from 'twilio';
import prisma from '~/utils/prisma';

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
    console.error('Error getting Twilio account:', error);
    throw error;
  };

  const getTwilioClient = ({ clientId, clientSecret }) => twilio(clientId, clientSecret);

  export const getMessagesToContact = async (client, leadPhoneNumber) => {
    try {
      const response = await client.messages.list({ to: leadPhoneNumber });
      return response.map((message) => ({
        to: message.to,
        from: message.from,
        body: message.body,
        date: message.dateSent,
        fromStudio: true,
      }));
    } catch (error) {
      console.error('Error getting messages to contact:', error);
      throw error;
    }

  };

  export const getMessagesFromContact = async (client, leadPhoneNumber) => {
    try {
      const response = await client.messages.list({ from: leadPhoneNumber });
      return response.map((message) => ({
        to: message.to,
        from: message.from,
        body: message.body,
        date: message.dateSent,
        fromStudio: false,
      }));
    } catch (error) {
      console.error('Error getting messages from contact:', error);
      throw error;
    }

  };

  export const getMessages = async ({ leadPhoneNumber, studioId }) => {
    try {
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
    } catch (error) {
      console.error('Error getting messages:', { leadPhoneNumber, studioId });
      throw error;
    }

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
      const sendRecord = await client.messages.create({
        body: message,
        from,
        to,
      });
      console.log(sendRecord)
      return sendRecord.sid
    } catch (error) {
      console.error('Error sending message:', { to, from, message, studioId })
      throw error;
    }
  };