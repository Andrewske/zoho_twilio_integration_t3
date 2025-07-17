'use server';
import twilio from 'twilio';
import { formatMobile } from '~/utils';
import { prisma } from '~/utils/prisma';
import { logError } from '~/utils/logError';
import { StudioMappings } from '~/utils/studioMappings';
import { MessageTransformers } from '~/utils/messageTransformers';
import { withAccountErrorHandling, withApiErrorHandling } from '~/utils/errorHandling';

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
  const twilioAccount = await getTwilioAccount(studioId);

  if (contact?.SMS_Opt_Out) {
    throw new Error('Contact has opted out of SMS');
  }

  if (!twilioAccount) {
    throw new Error('Could not find Twilio account');
  }

  const client = getTwilioClient({ 
    clientId: twilioAccount.clientId, 
    clientSecret: twilioAccount.clientSecret 
  });

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
          fromNumber: formatMobile(from),
          toNumber: formatMobile(to),
          message,
          twilioMessageId: sendRecord.sid,
        },
      });
    }

    return { twilioMessageId: sendRecord.sid };
  } catch (error) {
    logError({
      message: error.message,
      error,
      level: 'error',
      data: { to, from, message, studioId },
    });
  }
};
