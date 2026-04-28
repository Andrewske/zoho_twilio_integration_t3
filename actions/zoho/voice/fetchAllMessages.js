'use server'
import { fetchMessagesForContact } from '~/actions/zoho/voice';
import { deduplicateZohoVoiceMessages } from '~/utils/messageDeduplication';
import { MessageTransformers } from '~/utils/messageTransformers';
import { StudioMappings } from '~/utils/studioMappings';

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
        const smsLogs = await fetchMessagesForContact(customerNumber, accessToken)
        console.log(`📞 Found ${smsLogs.length} SMS logs from Zoho Voice`);

        if (!smsLogs.length) {
            return [];
        }

        // Enhanced deduplication: check both zohoMessageId and content/timing matches
        const { newMessages: newSmsLogs, messagesToUpdate } = await deduplicateZohoVoiceMessages(
            smsLogs,
            prisma,
            customerNumber
        );

        // Update existing messages with zohoMessageId (and status when ZV log has one)
        if (messagesToUpdate.length > 0) {
            console.log(`🔄 Updating ${messagesToUpdate.length} existing messages with zohoMessageId`);

            for (const update of messagesToUpdate) {
                const data = { zohoMessageId: update.zohoMessageId };
                if (update.status) data.status = update.status;
                await prisma.message.update({
                    where: { id: update.messageId },
                    data
                });
            }
        }

        if (!newSmsLogs.length) {
            console.log(`📞 No new Zoho Voice messages for contact ${contactId}`);
            return [];
        }

        // Get phone to studio mapping using centralized utility
        const phoneToStudio = await StudioMappings.getPhoneToStudioMap();

        // Transform messages using centralized utility
        const messagesToSave = MessageTransformers.bulkZohoVoiceToDb(newSmsLogs, phoneToStudio, contactId);

        // Log studio mapping for debugging
        messagesToSave.forEach((msg, index) => {
            const log = newSmsLogs[index];
            const isIncoming = log.messageType === 'INCOMING';
            const studioPhone = isIncoming ? log.senderId : log.customerNumber;
            const studio = phoneToStudio[studioPhone];
            console.log(`📞 Message ${log.logid}: ${log.messageType}, studio phone: ${studioPhone}, found studio: ${studio?.name || 'Unknown'}`);
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
