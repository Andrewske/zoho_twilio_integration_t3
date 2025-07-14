'use server';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';
import { sendMessage as sendTwilioMessage } from '../twilio';
import { sendSmsWithRetry as sendZohoVoiceMessage } from '../zoho/voice/index.js';

/**
 * Send SMS message through appropriate provider (Twilio or Zoho Voice)
 * @param {Object} params - Message parameters
 * @param {string} params.to - Recipient phone number
 * @param {string} params.from - Sender phone number  
 * @param {string} params.message - Message content
 * @param {string} params.studioId - Studio ID
 * @param {Object} params.contact - Contact object
 * @returns {Promise<Object>} Send response
 */
export const sendMessage = async ({ to, from, message, studioId, selectedSender, contact }) => {
  try {
    console.log('🚀 SendMessage called with:', { to, from, message, studioId, selectedSender });
    
    // Determine which studio to use based on selectedSender or fallback to studioId
    let actualStudioId = studioId;
    
    if (selectedSender) {
      if (selectedSender.id === 'admin') {
        // Get philip_admin studio ID
        const adminStudio = await prisma.studio.findFirst({
          where: { name: 'philip_admin' },
          select: { id: true }
        });
        actualStudioId = adminStudio?.id;
        console.log('🚀 Using admin studio ID:', actualStudioId);
      } else {
        // Get studio ID by name
        const senderStudio = await prisma.studio.findFirst({
          where: { name: selectedSender.id },
          select: { id: true }
        });
        actualStudioId = senderStudio?.id;
        console.log('🚀 Using sender studio ID:', actualStudioId, 'for sender:', selectedSender.id);
      }
    }

    if (!actualStudioId) {
      throw new Error('No studio ID available for sending');
    }

    // Get studio information to determine which provider to use
    const studio = await prisma.studio.findUnique({
      where: { id: actualStudioId },
      select: {
        name: true,
        twilioPhone: true,
        zohoVoicePhone: true,
        active: true
      }
    });

    console.log('🚀 Found studio:', studio);

    if (!studio) {
      throw new Error('Studio not found');
    }

    if (contact?.SMS_Opt_Out) {
      throw new Error('Contact has opted out of SMS');
    }

    let response;
    let provider;

    // Determine which provider to use based on the 'from' phone number
    console.log('🚀 Checking provider - from:', from, 'studio.zohoVoicePhone:', studio.zohoVoicePhone, 'studio.twilioPhone:', studio.twilioPhone);
    
    if (from === studio.zohoVoicePhone && studio.zohoVoicePhone) {
      // Send via Zoho Voice
      try {
        response = await sendZohoVoiceMessage({
          studioId: actualStudioId,
          to,
          message,
          prisma
        });
        
        // Save to database
        await prisma.message.create({
          data: {
            studioId: actualStudioId,
            contactId: contact?.id,
            fromNumber: from,
            toNumber: to,
            message,
            provider: 'zoho_voice',
            zohoMessageId: response?.logid || null,
          },
        });

        return { 
          success: true, 
          provider: 'zoho_voice',
          messageId: response?.logid 
        };
      } catch (error) {
        console.error('Zoho Voice send failed:', error);
        logError({
          message: 'Zoho Voice send failed',
          error,
          level: 'error',
          data: { to, from, message, studioId: actualStudioId },
        });
        throw error;
      }
    } else if (from === studio.twilioPhone && studio.twilioPhone) {
      // Send via Twilio
      console.log('🚀 Sending via Twilio');
      return await sendViaTwilio({ to, from, message, studioId: actualStudioId, contact });
    } else {
      // If 'from' doesn't match either phone, choose best available
      if (studio.zohoVoicePhone) {
        return await sendMessage({ to, from: studio.zohoVoicePhone, message, studioId: actualStudioId, selectedSender, contact });
      } else if (studio.twilioPhone) {
        return await sendMessage({ to, from: studio.twilioPhone, message, studioId: actualStudioId, selectedSender, contact });
      } else {
        throw new Error('No phone numbers configured for studio');
      }
    }

  } catch (error) {
    logError({
      message: 'Error sending unified message',
      error,
      level: 'error',
      data: { to, from, message, studioId },
    });
    throw error;
  }
};

/**
 * Send message via Twilio
 * @param {Object} params - Twilio message parameters
 * @returns {Promise<Object>} Twilio send response
 */
/**
 * Format phone number for Twilio (needs +1 prefix)
 */
function formatPhoneForTwilio(phoneNumber) {
  if (!phoneNumber) return phoneNumber;
  
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // If it's 10 digits, add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // If it's 11 digits starting with 1, add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  // If it already starts with +, return as-is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // Fallback: add + to whatever we have
  return `+${cleaned}`;
}

async function sendViaTwilio({ to, from, message, studioId, contact }) {
  try {
    // Format phone numbers for Twilio
    const formattedTo = formatPhoneForTwilio(to);
    const formattedFrom = formatPhoneForTwilio(from);
    
    console.log('🚀 Twilio - Original:', { to, from }, 'Formatted:', { to: formattedTo, from: formattedFrom });
    
    const response = await sendTwilioMessage({ 
      to: formattedTo, 
      from: formattedFrom, 
      message, 
      studioId, 
      contact 
    });
    
    return {
      success: true,
      provider: 'twilio',
      twilioMessageId: response?.twilioMessageId
    };
  } catch (error) {
    logError({
      message: 'Error sending Twilio message',
      error,
      level: 'error',
      data: { to, from, message, studioId },
    });
    throw error;
  }
}