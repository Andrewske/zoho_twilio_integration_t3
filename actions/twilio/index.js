'use server';

import twilio from 'twilio';
import { logError } from '~/utils/rollbar';
// const { MessagingResponse } = twilio.twiml;

const accountSid =
  process.env.NODE_ENV === 'production'
    ? process.env.TWILIO_ACCOUNT_SID_FADS
    : process.env.TWILIO_ACCOUNT_SID_KEV;
const authToken =
  process.env.NODE_ENV === 'production'
    ? process.env.TWILIO_AUTH_TOKEN_FADS
    : process.env.TWILIO_AUTH_TOKEN_KEV;

export const getMessages = async ({ leadPhoneNumber }) => {
  try {
    const client = twilio(accountSid, authToken);

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
};

// Create a route to send a new text message
export const sendMessage = async ({ to, /* from,*/ message }) => {
  const from =
    process.env.NODE_ENV === 'production'
      ? process.env.TWILIO_NUMBER_FADS
      : process.env.TWILIO_NUMBER_KEV;

  try {
    const client = twilio(accountSid, authToken);

    await client.messages.create({
      body: message,
      from,
      to,
    });
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
};
