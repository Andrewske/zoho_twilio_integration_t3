'use server';
import { prisma } from '~/utils/prisma';
import { PhoneFormatter } from '~/utils/phoneNumber';
import { StudioMappings } from '~/utils/studioMappings';
import { withMessageErrorHandling } from '~/utils/errorHandling';
import { sendMessage as sendTwilioMessage } from '../twilio';
import { sendSmsWithRetry as sendZohoVoiceMessage } from '../zoho/voice/index.js';

/**
 * Resolve studio ID based on selected sender
 * @param {string} studioId - Default studio ID
 * @param {Object} selectedSender - Selected sender object
 * @returns {Promise<string>} Resolved studio ID
 */
async function resolveStudioId(studioId, selectedSender) {
  if (!selectedSender) {
    return studioId;
  }

  if (selectedSender.id === 'admin') {
    const adminStudio = await StudioMappings.getStudioByName('philip_admin');
    return adminStudio?.id;
  }

  const senderStudio = await StudioMappings.getStudioByName(selectedSender.id);
  return senderStudio?.id;
}

/**
 * Determine provider based on studio phone numbers and 'from' number
 * @param {Object} studio - Studio object with phone numbers
 * @param {string} from - From phone number
 * @returns {string} Provider name ('zoho_voice' or 'twilio')
 */
function determineProvider(studio, from) {
  // Direct match with studio phone numbers
  if (from === studio.zohoVoicePhone && studio.zohoVoicePhone) {
    return 'zoho_voice';
  }
  
  if (from === studio.twilioPhone && studio.twilioPhone) {
    return 'twilio';
  }

  // Fallback: prefer Zoho Voice if available, otherwise Twilio
  if (studio.zohoVoicePhone) {
    return 'zoho_voice';
  }
  
  if (studio.twilioPhone) {
    return 'twilio';
  }

  throw new Error('No phone numbers configured for studio');
}

/**
 * Get the appropriate phone number for the provider
 * @param {Object} studio - Studio object
 * @param {string} provider - Provider name
 * @returns {string} Phone number for the provider
 */
function getProviderPhone(studio, provider) {
  switch (provider) {
    case 'zoho_voice':
      return studio.zohoVoicePhone;
    case 'twilio':
      return studio.twilioPhone;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Send SMS via Zoho Voice and save to database
 * @param {Object} params - Send parameters
 * @returns {Promise<Object>} Send response
 */
async function sendViaZohoVoice({ studioId, to, from, message, contact }) {
  const response = await sendZohoVoiceMessage({
    studioId,
    to,
    message,
    prisma
  });
  
  // Save to database
  await prisma.message.create({
    data: {
      studioId,
      contactId: contact?.id,
      fromNumber: PhoneFormatter.normalize(from),
      toNumber: PhoneFormatter.normalize(to),
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
}

/**
 * Send SMS via Twilio and handle formatting
 * @param {Object} params - Send parameters
 * @returns {Promise<Object>} Send response
 */
async function sendViaTwilio({ to, from, message, studioId, contact }) {
  // Format phone numbers for Twilio
  const formattedTo = PhoneFormatter.forTwilio(to);
  const formattedFrom = PhoneFormatter.forTwilio(from);
  
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
}

/**
 * Send SMS message through appropriate provider (Twilio or Zoho Voice)
 * @param {Object} params - Message parameters
 * @param {string} params.to - Recipient phone number
 * @param {string} params.from - Sender phone number  
 * @param {string} params.message - Message content
 * @param {string} params.studioId - Studio ID
 * @param {Object} params.selectedSender - Selected sender object
 * @param {Object} params.contact - Contact object
 * @returns {Promise<Object>} Send response
 */
const _sendMessage = async ({ to, from, message, studioId, selectedSender, contact }) => {
  console.log('🚀 SendMessage called with:', { to, from, message, studioId, selectedSender });
  
  // Validate contact opt-out status
  if (contact?.SMS_Opt_Out) {
    throw new Error('Contact has opted out of SMS');
  }

  // Resolve the actual studio to use
  const actualStudioId = await resolveStudioId(studioId, selectedSender);
  if (!actualStudioId) {
    throw new Error('No studio ID available for sending');
  }

  // Get studio information
  const studio = await StudioMappings.getStudioById(actualStudioId);
  if (!studio) {
    throw new Error('Studio not found');
  }
  
  if (!studio.active) {
    throw new Error('Studio is not active');
  }

  console.log('🚀 Found studio:', studio);

  // Determine provider and get appropriate phone number
  const provider = determineProvider(studio, from);
  const providerPhone = getProviderPhone(studio, provider);
  
  console.log('🚀 Using provider:', provider, 'with phone:', providerPhone);

  // Send via appropriate provider
  const sendParams = { 
    studioId: actualStudioId, 
    to, 
    from: providerPhone, 
    message, 
    contact 
  };

  switch (provider) {
    case 'zoho_voice':
      return await sendViaZohoVoice(sendParams);
    case 'twilio':
      return await sendViaTwilio(sendParams);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
};

// Apply error handling wrapper
export const sendMessage = withMessageErrorHandling(_sendMessage, 'unified');

