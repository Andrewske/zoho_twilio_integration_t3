
import { AccountManager } from '~/utils/accountManager';
import { MessageTransformers } from '~/utils/messageTransformers';
import { PhoneFormatter } from '~/utils/phoneNumber';

/**
 * Fetch SMS logs from Zoho Voice API
 * @param {Object} params - API parameters
 * @param {string} params.accessToken - Access token for Zoho Voice API
 * @param {string} [params.customerNumber] - Filter by customer phone number
 * @param {string} [params.fromDate] - Start date (yyyy-MM-dd)
 * @param {string} [params.toDate] - End date (yyyy-MM-dd)
 * @param {string} [params.messageType] - 'all'|'incoming'|'outgoing'
 * @param {number} [params.from] - Start index for pagination
 * @param {number} [params.size] - Number of records to fetch (default 100)
 * @returns {Promise<Object>} SMS logs response
 */
async function fetchSmsLogs(params) {
    const {
        accessToken,
        customerNumber,
        fromDate,
        toDate
    } = params;

    const url = new URL('https://voice.zoho.com/rest/json/v1/sms/logs');


    if (customerNumber) {
        url.searchParams.append('customerNumber', customerNumber);
    }

    if (fromDate) {
        url.searchParams.append('fromDate', fromDate);
    }

    if (toDate) {
        url.searchParams.append('toDate', toDate);
    }

    console.log(`🌐 Zoho Voice API Request: ${url.toString()}`);
    console.log(`🔑 Access Token: ${accessToken?.substring(0, 20)}...`);

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    });

    console.log(`🌐 Zoho Voice API Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`🌐 Zoho Voice API Error Body: ${errorBody}`);
        throw new Error(`Zoho Voice API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    return await response.json();
}

/**
 * Fetch SMS messages for a specific contact/customer number
 * @param {string} customerNumber - Customer phone number
 * @param {string} accessToken - Access token
 * @param {Object} [options] - Additional options
 * @returns {Promise<Array>} Array of SMS messages
 */
async function fetchMessagesForContact(customerNumber, accessToken, options = {}) {
    try {
        // Format phone number for Zoho Voice API (needs international format)
        const formattedNumber = PhoneFormatter.forZohoVoice(customerNumber);
        console.log(`📞 Formatted phone number: ${customerNumber} -> ${formattedNumber}`);

        const response = await fetchSmsLogs({
            accessToken,
            customerNumber: formattedNumber,
            messageType: 'all',
            size: 1000, // Get more messages for contact history
            ...options
        });

        if (response.status === 'success' && response.smsLogQuery) {
            console.log(JSON.stringify(response, null, 2))
            return response.smsLogQuery;
        }

        return [];
    } catch (error) {
        console.error('Error fetching messages for contact:', error);
        throw error;
    }
}

// Use centralized MessageTransformers utility
const transformSmsLogToMessage = MessageTransformers.zohoVoiceToDb;

/**
 * Fetch and save Zoho Voice messages for a contact
 * @param {Object} params - Parameters
 * @param {string} params.customerNumber - Customer phone number
 * @param {string} params.studioId - Studio ID
 * @param {string} params.contactId - Contact ID
 * @param {string} params.accessToken - Access token
 * @param {Object} params.prisma - Prisma client instance
 * @returns {Promise<Array>} Saved messages
 */
async function fetchAndSaveMessages(params) {
    const { customerNumber, studioId, contactId, accessToken, prisma } = params;

    try {
        console.log(`📞 Fetching Zoho Voice messages for customer: ${customerNumber}`);
        // Fetch messages from Zoho Voice
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
            console.log(`No new Zoho Voice messages for contact ${contactId}`);
            return [];
        }

        // Transform and save new messages
        const messagesToSave = newSmsLogs.map(log =>
            transformSmsLogToMessage(log, studioId, contactId)
        );

        const savedMessages = await prisma.message.createMany({
            data: messagesToSave,
            skipDuplicates: true
        });

        console.log(`Saved ${savedMessages.count} new Zoho Voice messages for contact ${contactId}`);

        return messagesToSave;

    } catch (error) {
        console.error('Error fetching and saving Zoho Voice messages:', error);
        throw error;
    }
}

/**
 * Send SMS via Zoho Voice API
 * @param {Object} params - SMS parameters
 * @param {string} params.accessToken - Access token
 * @param {string} params.from - Sender phone number
 * @param {string} params.to - Recipient phone number
 * @param {string} params.message - Message content
 * @returns {Promise<Object>} Send response
 */
async function sendSms(params) {
    const { accessToken, from, to, message } = params;

    const formattedFrom = PhoneFormatter.forZohoVoice(from);
    const formattedTo = PhoneFormatter.forZohoVoice(to);

    const requestBody = {
        senderId: formattedFrom,
        customerNumber: formattedTo,
        message,
    };

    const response = await fetch('https://voice.zoho.com/rest/json/v1/sms/send', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('📤 Zoho Voice Send Error:', response.status, response.statusText, errorBody);
        throw new Error(`Zoho Voice SMS send error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const responseData = await response.json();
    console.log('📤 Zoho Voice Send Success:', { logid: responseData?.send?.logid, status: responseData?.status });
    return responseData;
}

/**
 * Send SMS with token refresh retry logic
 * @param {Object} params - SMS parameters including studio info
 * @returns {Promise<Object>} Send response
 */
async function sendSmsWithRetry(params) {
    const { studioId, to, message, prisma } = params;

    try {
        // Get studio's Zoho Voice phone number
        const studio = await prisma.studio.findUnique({
            where: { id: studioId },
            select: { zohoVoicePhone: true }
        });

        if (!studio?.zohoVoicePhone) {
            throw new Error(`Studio ${studioId} does not have a Zoho Voice phone number configured`);
        }

        // Get Zoho account using centralized AccountManager
        const zohoAccount = await AccountManager.getZohoAccount(studioId);

        if (!zohoAccount?.accessToken) {
            throw new Error('No Zoho access token available');
        }

        return await sendSms({
            accessToken: zohoAccount.accessToken,
            from: studio.zohoVoicePhone,
            to,
            message
        });
    } catch (error) {
        console.error('Error sending Zoho Voice SMS:', error);
        throw error;
    }
}

export {
    fetchAndSaveMessages, fetchMessagesForContact, fetchSmsLogs, sendSms,
    sendSmsWithRetry, transformSmsLogToMessage
};
