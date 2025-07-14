'use server';
import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';
import { StudioMappings } from '~/utils/studioMappings';
import { MessageTransformers } from '~/utils/messageTransformers';
import { PrismaSelectors } from '~/utils/prismaSelectors';
import { getMessages as getTwilioMessages } from '../twilio';
import { fetchAndSaveZohoVoiceMessages } from '../zoho/voice/fetchAllMessages';
import { getZohoAccount } from '../zoho';

/**
 * Get unified messages for a contact from both Twilio and Zoho Voice
 * @param {Object} params - Parameters
 * @param {string} params.contactMobile - Contact mobile number
 * @param {string} params.studioId - Studio ID
 * @param {string} [params.contactId] - Zoho Contact ID
 * @returns {Promise<Array>} Unified message list
 */
export const getMessages = async ({ contactMobile, studioId, contactId }) => {
  try {
    // Get studio information to determine which services it uses
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: {
        name: true,
        twilioPhone: true,
        zohoVoicePhone: true,
        active: true
      }
    });

    if (!studio) {
      throw new Error('Studio not found');
    }

    let allMessages = [];
    
    // Get messages from database first (both Twilio and Zoho Voice)
    const dbMessages = await getMessagesFromDatabase(contactMobile, studioId);
    
    // Always try to fetch Zoho Voice messages if we have a contactId
    if (contactId) {
      console.log(`🔍 Fetching Zoho Voice messages for contact: ${contactId}, mobile: ${formatMobile(contactMobile)}`);
      try {
        const account = await getZohoAccount({ studioId });
        console.log(`🔍 Got Zoho account: ${account?.clientId}`);
        
        if (account?.accessToken) {
          await fetchAndSaveZohoVoiceMessages({
            customerNumber: formatMobile(contactMobile),
            contactId,
            accessToken: account.accessToken,
            prisma
          });
        } else {
          console.log('🔍 No Zoho access token available');
        }
        
        // Refresh database messages after saving new ones
        const updatedDbMessages = await getMessagesFromDatabase(contactMobile, studioId);
        allMessages.push(...updatedDbMessages);
      } catch (error) {
        console.error('Error fetching Zoho Voice messages:', error);
        // Continue with database messages if Zoho Voice fails
        allMessages.push(...dbMessages);
      }
    } else {
      allMessages.push(...dbMessages);
    }

    // If studio still has Twilio (backward compatibility), get those messages too
    if (studio.twilioPhone) {
      try {
        const twilioMessages = await getTwilioMessages({ contactMobile, studioId });
        
        // Filter out Twilio messages that are already in database
        const existingTwilioIds = new Set(
          allMessages
            .filter(msg => msg.provider === 'twilio' && msg.twilioMessageId)
            .map(msg => msg.twilioMessageId)
        );
        
        const newTwilioMessages = twilioMessages.filter(msg => 
          !existingTwilioIds.has(msg.twilioMessageId)
        );
        
        allMessages.push(...newTwilioMessages);
      } catch (error) {
        console.error('Error fetching Twilio messages:', error);
        // Continue without Twilio messages if it fails
      }
    }

    // Sort all messages by date
    const sortedMessages = allMessages.sort(
      (a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt)
    );

    return sortedMessages;

  } catch (error) {
    logError({
      message: 'Error getting unified messages',
      error,
      level: 'warning',
      data: { contactMobile, studioId, contactId },
    });
    throw error;
  }
};

/**
 * Get messages from database (both Twilio and Zoho Voice)
 * @param {string} contactMobile - Contact mobile number
 * @param {string} studioId - Studio ID
 * @returns {Promise<Array>} Database messages in ChatWindow format
 */
async function getMessagesFromDatabase(contactMobile, studioId) {
  try {
    const formattedMobile = formatMobile(contactMobile);
    
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { fromNumber: formattedMobile },
          { toNumber: formattedMobile }
        ]
      },
      select: PrismaSelectors.message.withStudio,
      orderBy: { createdAt: 'asc' }
    });

    // Get phone to studio name mapping using centralized utility
    const phoneToStudioName = await StudioMappings.getStudioNamesDict();

    // Use centralized message transformer
    return MessageTransformers.bulkDbToUI(messages, formattedMobile, phoneToStudioName);
  } catch (error) {
    logError({
      message: 'Error getting messages from database',
      error,
      level: 'error',
      data: { contactMobile, studioId },
    });
    throw error;
  }
}

// Re-export from centralized utility for backward compatibility
export const getAllStudioNames = async () => {
  const { StudioMappings } = await import('~/utils/studioMappings');
  return await StudioMappings.getStudioNamesDict();
};