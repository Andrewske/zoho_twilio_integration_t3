
/**
 * Format phone number for Zoho Voice API (expects international format)
 * @param {string} phoneNumber - Raw phone number
 * @returns {string} Formatted phone number with country code
 */
function formatPhoneForZohoVoice(phoneNumber) {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it's a 10-digit US number, add 1 prefix (no + symbol)
    if (cleaned.length === 10) {
        return `1${cleaned}`;
    }
    
    // If it's 11 digits starting with 1, return as-is
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return cleaned;
    }
    
    // For other formats, return just the digits
    return cleaned;
}

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
        toDate,
        messageType = 'all',
        from = 0,
        size = 100
    } = params;

    const url = new URL('https://voice.zoho.com/rest/json/v1/sms/logs');
    
    // Add query parameters
    // if (from > 0) {
    //     url.searchParams.append('from', from.toString());
    // }
    // url.searchParams.append('size', size.toString());
    // url.searchParams.append('messageType', messageType);
    
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
            'Content-Type': 'application/json'
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
        const formattedNumber = formatPhoneForZohoVoice(customerNumber);
        console.log(`📞 Formatted phone number: ${customerNumber} -> ${formattedNumber}`);
        
        const response = await fetchSmsLogs({
            accessToken,
            customerNumber: formattedNumber,
            messageType: 'all',
            size: 1000, // Get more messages for contact history
            ...options
        });

        if (response.status === 'success' && response.smsLogQuery) {
            return response.smsLogQuery;
        }

        return [];
    } catch (error) {
        console.error('Error fetching messages for contact:', error);
        throw error;
    }
}

/**
 * Transform Zoho Voice SMS log to our Message model format
 * @param {Object} smsLog - SMS log from Zoho Voice API
 * @param {string} studioId - Studio ID
 * @param {string} contactId - Contact ID from Zoho CRM
 * @returns {Object} Message object for database insertion
 */
function transformSmsLogToMessage(smsLog, studioId, contactId) {
    const isIncoming = smsLog.messageType === 'INCOMING';
    
    return {
        fromNumber: isIncoming ? smsLog.customerNumber : smsLog.senderId,
        toNumber: isIncoming ? smsLog.senderId : smsLog.customerNumber,
        studioId,
        contactId,
        message: smsLog.message || '',
        provider: 'zoho_voice',
        zohoMessageId: smsLog.logid,
        isWelcomeMessage: false,
        isFollowUpMessage: false,
        createdAt: new Date(smsLog.submittedTime)
    };
}

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

    // Format phone numbers for Zoho Voice API (ensure international format)
    const formattedFrom = formatPhoneForZohoVoice(from);
    const formattedTo = formatPhoneForZohoVoice(to);

    // Try different parameter combinations to fix "Extra parameter found" error
    const requestVariations = [
        // Variation 1: Try 'text' instead of 'message'
        {
            variation: 'text field',
            contentType: 'application/json',
            body: {
                from: formattedFrom,
                to: formattedTo,
                text: message
            }
        },
        // Variation 2: Try different parameter names (like fetchSmsLogs uses)
        {
            variation: 'senderId/customerNumber',
            contentType: 'application/json',
            body: {
                senderId: formattedFrom,
                customerNumber: formattedTo,
                message: message
            }
        },
        // Variation 3: Try minimal parameters
        {
            variation: 'minimal params',
            contentType: 'application/json',
            body: {
                to: formattedTo,
                message: message
            }
        },
        // Variation 4: Try form data format
        {
            variation: 'form data',
            contentType: 'application/x-www-form-urlencoded',
            body: new URLSearchParams({
                from: formattedFrom,
                to: formattedTo,
                message: message
            }).toString()
        },
        // Variation 5: Original format (for reference)
        {
            variation: 'original',
            contentType: 'application/json',
            body: {
                from: formattedFrom,
                to: formattedTo,
                message: message
            }
        }
    ];

    let lastError = null;

    for (let i = 0; i < requestVariations.length; i++) {
        const variation = requestVariations[i];
        const { contentType, body: requestBody } = variation;
        
        console.log(`📤 Zoho Voice Send Attempt ${i + 1} (${variation.variation}):`, {
            url: 'https://voice.zoho.com/rest/json/v1/sms/send',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken?.substring(0, 20)}...`,
                'Content-Type': contentType
            },
            body: requestBody,
            originalNumbers: { from, to },
            formattedNumbers: { from: formattedFrom, to: formattedTo }
        });

        try {
            const fetchBody = contentType === 'application/json' ? JSON.stringify(requestBody) : requestBody;
            
            const response = await fetch('https://voice.zoho.com/rest/json/v1/sms/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': contentType
                },
                body: fetchBody
            });

            console.log(`📤 Zoho Voice Send Response ${i + 1} (${variation.variation}):`, response.status, response.statusText);

            if (response.ok) {
                const responseData = await response.json();
                console.log(`📤 Zoho Voice Send Success (${variation.variation}):`, responseData);
                return responseData;
            } else {
                const errorBody = await response.text();
                console.error(`📤 Zoho Voice Send Error ${i + 1} (${variation.variation}):`, errorBody);
                lastError = new Error(`Zoho Voice SMS send error: ${response.status} ${response.statusText} - ${errorBody}`);
                
                // If this isn't the last attempt, continue to next variation
                if (i < requestVariations.length - 1) {
                    console.log(`📤 Trying next parameter variation...`);
                    continue;
                }
            }
        } catch (fetchError) {
            console.error(`📤 Fetch error on attempt ${i + 1} (${variation.variation}):`, fetchError);
            lastError = fetchError;
            if (i < requestVariations.length - 1) {
                continue;
            }
        }
    }

    // If we get here, all variations failed
    console.error('📤 All parameter variations failed');
    throw lastError || new Error('All SMS send attempts failed');
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

        // Get access token (simplified - you'll need to implement proper token management)
        const studioAccounts = await prisma.studioAccount.findMany({
            where: { studioId },
            include: { Account: true }
        });

        const zohoAccount = studioAccounts
            .map(sa => sa.Account)
            .find(account => account.platform === 'zoho');

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
    fetchSmsLogs,
    fetchMessagesForContact,
    transformSmsLogToMessage,
    fetchAndSaveMessages,
    sendSms,
    sendSmsWithRetry
};