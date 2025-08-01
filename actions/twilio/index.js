'use server';
import { readFile } from 'node:fs/promises';
import twilio from 'twilio';
import { formatMobile } from '~/utils';
import { withApiErrorHandling } from '~/utils/errorHandling';
import { logError } from '~/utils/logError';
import { MessageTransformers } from '~/utils/messageTransformers';
import { prisma } from '~/utils/prisma';
import { StudioMappings } from '~/utils/studioMappings';

// Re-export from centralized AccountManager utility
export const getTwilioAccount = async (studioId) => {
  const { AccountManager } = await import('~/utils/accountManager');
  return await AccountManager.getTwilioAccount(studioId);
};

export const getTwilioClient = ({ clientId, clientSecret }) =>
  twilio(clientId, clientSecret, { region: 'US1', edge: 'umatilla' });

const _getMessagesToContact = async (client, contactMobile, studioNames) => {
  const response = await client.messages.list({ to: contactMobile });
  return response.map((message) =>
    MessageTransformers.twilioToUI(message, studioNames, true)
  );
};

export const getMessagesToContact = withApiErrorHandling(_getMessagesToContact, 'twilio');

const _getMessagesFromContact = async (client, contactMobile, studioNames) => {
  const response = await client.messages.list({ from: contactMobile });
  return response.map((message) =>
    MessageTransformers.twilioToUI(message, studioNames, false)
  );
};

export const getMessagesFromContact = withApiErrorHandling(_getMessagesFromContact, 'twilio');

// Use centralized StudioMappings utility
const getAllStudioNames = async () => {
  return await StudioMappings.getStudioNamesDict();
};

const _getMessages = async ({ contactMobile, studioId }) => {
  const twilioAccount = await getTwilioAccount(studioId);

  if (!twilioAccount) {
    throw new Error('Could not find Twilio account');
  }

  // Extract clientId and clientSecret for Twilio client
  const client = getTwilioClient({
    clientId: twilioAccount.clientId,
    clientSecret: twilioAccount.clientSecret
  });

  const studioNames = await getAllStudioNames();
  const messagesToContact = await getMessagesToContact(client, contactMobile, studioNames);
  const messagesFromContact = await getMessagesFromContact(
    client,
    contactMobile,
    studioNames
  );

  const finalMessages = [...messagesToContact, ...messagesFromContact].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  return finalMessages;
};

// Apply error handling wrapper
export const getMessages = withApiErrorHandling(_getMessages, 'twilio');


// Create a route to send a new text message
export const sendMessage = async ({
  to,
  from,
  message,
  studioId,
  contact,
  messageId = null,
}) => {
  // Check for Twilio account and SMS opt-out
  const twilioAccount = await getTwilioAccount(studioId);

  if (contact?.SMS_Opt_Out) {
    throw new Error('Contact has opted out of SMS');
  }

  if (!twilioAccount) {
    throw new Error('Could not find Twilio account');
  }

  // Initialize Twilio client
  const client = getTwilioClient({
    clientId: twilioAccount.clientId,
    clientSecret: twilioAccount.clientSecret,
  });

  // Prepare message record for database
  const newMessage = {
    studioId,
    contactId: contact?.id,
    fromNumber: formatMobile(from),
    toNumber: formatMobile(to),
    message,
    twilioMessageId: null,
    errorCode: null,
    errorMessage: null,
    status: 'sending',
  };



  try {
    // Attempt to send the message via Twilio
    const sendRecord = await client.messages.create({
      body: message,
      from,
      to,
    });

    newMessage.twilioMessageId = sendRecord.sid;
  } catch (error) {
    // On error, attempt to map error code to friendly message
    try {
      const errorCodesRaw = await readFile('lib/twilio-error-codes.json', 'utf8');
      const errorCodes = JSON.parse(errorCodesRaw).map(err => ({
        errorCode: err.code,
        errorMessage: `${err.message} ${err.secondary_message}`,
      }));

      const matchedError = errorCodes.find(err => err.errorCode === error.code);

      if (matchedError) {
        newMessage.errorMessage = matchedError.errorMessage;
        newMessage.errorCode = matchedError.errorCode;
        newMessage.status = 'failed';
      }
    } catch (parseError) {
      // If error code mapping fails, log but do not block
      logError({
        message: 'Failed to parse Twilio error codes',
        error: parseError,
        level: 'error',
        data: { to, from, message, studioId },
      });
    }

    // Log the original error
    logError({
      message: error.message,
      error,
      level: 'error',
      data: { to, from, message, studioId },
    });
  } finally {
    // Always record the message attempt in the database

    if (messageId) {
      await prisma.message.update({
        where: { id: messageId },
        data: newMessage,
      });
    } else {
      await prisma.message.create({
        data: newMessage,
      });
    }

    return newMessage
  }
};
