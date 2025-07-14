import { fetchMessagesForContact, transformSmsLogToMessage } from './index.js';
import { prisma } from '~/utils/prisma.js';

/**
 * Normalize phone number to 10 digits (remove +1, spaces, etc.)
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string} 10-digit phone number
 */
function normalizePhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it's 11 digits starting with 1, remove the 1
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return cleaned.substring(1);
    }
    
    // If it's already 10 digits, return as-is
    if (cleaned.length === 10) {
        return cleaned;
    }
    
    // For other cases, return the cleaned version
    return cleaned;
}

/**
 * Fetch and save Zoho Voice messages for a contact without requiring studio config
 * @param {Object} params - Parameters
 * @param {string} params.customerNumber - Customer phone number
 * @param {string} params.contactId - Contact ID
 * @param {string} params.accessToken - Access token
 * @param {Object} params.prisma - Prisma client instance
 * @returns {Promise<Array>} Saved messages
 */
async function fetchAndSaveZohoVoiceMessages(params) {
    const { customerNumber, contactId, accessToken, prisma } = params;
    
    try {
        console.log(`📞 Fetching Zoho Voice messages for customer: ${customerNumber}`);
        
        // Fetch messages from Zoho Voice API
        const smsLogs = await fetchMessagesForContact(customerNumber, accessToken);
        console.log(`📞 Found ${smsLogs.length} SMS logs from Zoho Voice`);
        
        if (!smsLogs.length) {
            return [];
        }

        // Check which messages we already have
        const existingMessageIds = await prisma.message.findMany({
            where: {
                provider: 'zoho_voice',
                zohoMessageId: {
                    in: smsLogs.map(log => log.logid)
                }
            },
            select: { zohoMessageId: true }
        });

        const existingIds = new Set(existingMessageIds.map(msg => msg.zohoMessageId));
        
        // Filter out messages we already have
        const newSmsLogs = smsLogs.filter(log => !existingIds.has(log.logid));
        
        if (!newSmsLogs.length) {
            console.log(`📞 No new Zoho Voice messages for contact ${contactId}`);
            return [];
        }

        // Get all studios with Zoho Voice numbers for mapping
        const studios = await prisma.studio.findMany({
            where: {
                zohoVoicePhone: { not: null }
            },
            select: {
                id: true,
                name: true,
                zohoVoicePhone: true
            }
        });

        // Create phone number to studio mapping
        const phoneToStudio = {};
        studios.forEach(studio => {
            if (studio.zohoVoicePhone) {
                // Normalize the studio phone to 10 digits
                const normalizedStudioPhone = normalizePhoneNumber(studio.zohoVoicePhone);
                
                // Store multiple formats for matching against Zoho Voice API responses
                phoneToStudio[studio.zohoVoicePhone] = studio; // Original format
                phoneToStudio[normalizedStudioPhone] = studio; // 10 digits
                phoneToStudio[`1${normalizedStudioPhone}`] = studio; // 11 digits with 1
                phoneToStudio[`+1 ${normalizedStudioPhone}`] = studio; // +1 format
                phoneToStudio[`+${normalizedStudioPhone}`] = studio; // + format
            }
        });

        // Transform and determine studio for each message
        const messagesToSave = newSmsLogs.map(log => {
            const isIncoming = log.messageType === 'INCOMING';
            const studioPhone = isIncoming ? log.senderId : log.customerNumber;
            const studio = phoneToStudio[studioPhone];
            
            console.log(`📞 Message ${log.logid}: ${log.messageType}, studio phone: ${studioPhone}, found studio: ${studio?.name || 'Unknown'}`);
            
            return {
                fromNumber: normalizePhoneNumber(isIncoming ? log.customerNumber : log.senderId),
                toNumber: normalizePhoneNumber(isIncoming ? log.senderId : log.customerNumber),
                studioId: studio?.id || null,
                contactId,
                message: log.message || '',
                provider: 'zoho_voice',
                zohoMessageId: log.logid,
                isWelcomeMessage: false,
                isFollowUpMessage: false,
                createdAt: new Date(log.submittedTime)
            };
        });

        // Save messages to database
        const savedMessages = await prisma.message.createMany({
            data: messagesToSave,
            skipDuplicates: true
        });

        console.log(`📞 Saved ${savedMessages.count} new Zoho Voice messages for contact ${contactId}`);
        
        return messagesToSave;
        
    } catch (error) {
        console.error('📞 Error fetching and saving Zoho Voice messages:', error);
        throw error;
    }
}

export {
    fetchAndSaveZohoVoiceMessages
};