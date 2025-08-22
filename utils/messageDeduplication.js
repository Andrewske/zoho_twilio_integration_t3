import { PhoneFormatter } from './phoneNumber.js';

/**
 * Time window (in minutes) to consider messages as potentially duplicates
 * Based on timing proximity
 */
const DUPLICATE_TIME_WINDOW_MINUTES = 5;

/**
 * Check if two messages are duplicates based on content and timing
 * @param {Object} message1 - First message
 * @param {Object} message2 - Second message or Zoho Voice log
 * @returns {boolean} True if messages are likely duplicates
 */
function areMessagesDuplicates(message1, message2) {
  // Normalize phone numbers for comparison
  const normalizePhone = PhoneFormatter.normalize;
  
  // Extract relevant fields, handling both database messages and Zoho Voice logs
  const msg1 = {
    message: message1.message?.trim(),
    fromNumber: normalizePhone(message1.fromNumber || message1.from),
    toNumber: normalizePhone(message1.toNumber || message1.to),
    createdAt: new Date(message1.createdAt || message1.created_at)
  };

  const msg2 = {
    message: message2.message?.trim() || message2.messageContent?.trim(),
    fromNumber: normalizePhone(message2.fromNumber || message2.from || message2.senderId),
    toNumber: normalizePhone(message2.toNumber || message2.to || message2.customerNumber),
    createdAt: new Date(message2.createdAt || message2.created_at || message2.createdTime)
  };

  // Check message content match (exact)
  if (msg1.message !== msg2.message) {
    return false;
  }

  // Check phone number matches (normalized)
  if (msg1.fromNumber !== msg2.fromNumber || msg1.toNumber !== msg2.toNumber) {
    return false;
  }

  // Check timing proximity (within DUPLICATE_TIME_WINDOW_MINUTES)
  const timeDiffMs = Math.abs(msg1.createdAt - msg2.createdAt);
  const timeDiffMinutes = timeDiffMs / (1000 * 60);
  
  return timeDiffMinutes <= DUPLICATE_TIME_WINDOW_MINUTES;
}

/**
 * Find existing database message that matches a Zoho Voice log
 * @param {Object} zohoLog - Zoho Voice message log
 * @param {Array} existingMessages - Array of existing database messages
 * @returns {Object|null} Matching database message or null
 */
function findMatchingDatabaseMessage(zohoLog, existingMessages) {
  return existingMessages.find(dbMsg => 
    areMessagesDuplicates(dbMsg, zohoLog)
  );
}

/**
 * Enhanced deduplication for Zoho Voice messages
 * Checks both zohoMessageId and content/timing matches
 * @param {Array} zohoLogs - Array of Zoho Voice message logs
 * @param {Object} prisma - Prisma client instance
 * @param {string} customerNumber - Customer phone number for filtering
 * @returns {Promise<Object>} Object containing new messages and messages to update
 */
async function deduplicateZohoVoiceMessages(zohoLogs, prisma, customerNumber) {
  if (!zohoLogs.length) {
    return { newMessages: [], messagesToUpdate: [] };
  }

  const formattedCustomerNumber = PhoneFormatter.normalize(customerNumber);
  
  // Get existing messages for this customer (including those without zohoMessageId)
  const existingMessages = await prisma.message.findMany({
    where: {
      provider: 'zoho_voice',
      OR: [
        { fromNumber: formattedCustomerNumber },
        { toNumber: formattedCustomerNumber }
      ]
    },
    select: {
      id: true,
      zohoMessageId: true,
      message: true,
      fromNumber: true,
      toNumber: true,
      createdAt: true
    }
  });

  console.log(`🔍 Found ${existingMessages.length} existing Zoho Voice messages for customer ${formattedCustomerNumber}`);

  // Get existing zohoMessageIds for quick lookup
  const existingZohoIds = new Set(
    existingMessages
      .filter(msg => msg.zohoMessageId)
      .map(msg => msg.zohoMessageId)
  );

  const newMessages = [];
  const messagesToUpdate = [];

  for (const log of zohoLogs) {
    // Skip if we already have this zohoMessageId
    if (existingZohoIds.has(log.logid)) {
      console.log(`⏭️ Skipping log ${log.logid} - already exists by zohoMessageId`);
      continue;
    }

    // Check for content/timing duplicates
    const matchingMessage = findMatchingDatabaseMessage(log, existingMessages);
    
    if (matchingMessage && !matchingMessage.zohoMessageId) {
      // Found a matching message without zohoMessageId - update it
      messagesToUpdate.push({
        messageId: matchingMessage.id,
        zohoMessageId: log.logid
      });
      console.log(`🔄 Will update message ${matchingMessage.id} with zohoMessageId ${log.logid}`);
    } else if (!matchingMessage) {
      // No duplicate found - this is a new message
      newMessages.push(log);
      console.log(`✨ New message found: ${log.logid}`);
    } else {
      // Matching message already has zohoMessageId - skip
      console.log(`⏭️ Skipping log ${log.logid} - duplicate content with existing message ${matchingMessage.id}`);
    }
  }

  return { newMessages, messagesToUpdate };
}

/**
 * Identify duplicate messages in the database for cleanup
 * @param {Object} prisma - Prisma client instance
 * @param {string} [customerNumber] - Optional customer number to limit scope
 * @returns {Promise<Array>} Array of duplicate message groups
 */
async function identifyDuplicateMessages(prisma, customerNumber = null) {
  const whereClause = {
    provider: 'zoho_voice'
  };

  if (customerNumber) {
    const formattedCustomerNumber = PhoneFormatter.normalize(customerNumber);
    whereClause.OR = [
      { fromNumber: formattedCustomerNumber },
      { toNumber: formattedCustomerNumber }
    ];
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    select: {
      id: true,
      zohoMessageId: true,
      message: true,
      fromNumber: true,
      toNumber: true,
      createdAt: true,
      studioId: true
    },
    orderBy: { createdAt: 'asc' }
  });

  const duplicateGroups = [];
  const processedIds = new Set();

  for (let i = 0; i < messages.length; i++) {
    if (processedIds.has(messages[i].id)) continue;

    const currentMessage = messages[i];
    const duplicates = [currentMessage];
    processedIds.add(currentMessage.id);

    // Find all duplicates of this message
    for (let j = i + 1; j < messages.length; j++) {
      if (processedIds.has(messages[j].id)) continue;

      if (areMessagesDuplicates(currentMessage, messages[j])) {
        duplicates.push(messages[j]);
        processedIds.add(messages[j].id);
      }
    }

    // If we found duplicates, add to results
    if (duplicates.length > 1) {
      duplicateGroups.push(duplicates);
    }
  }

  return duplicateGroups;
}

/**
 * Get the preferred message from a group of duplicates
 * Priority: message with zohoMessageId and studioId > message with zohoMessageId > oldest message
 * @param {Array} duplicateMessages - Array of duplicate messages
 * @returns {Object} The message to keep
 */
function getPreferredMessage(duplicateMessages) {
  // Sort by preference
  return duplicateMessages.sort((a, b) => {
    // Priority 1: Has both zohoMessageId and studioId
    const aComplete = a.zohoMessageId && a.studioId;
    const bComplete = b.zohoMessageId && b.studioId;
    if (aComplete && !bComplete) return -1;
    if (!aComplete && bComplete) return 1;

    // Priority 2: Has zohoMessageId
    if (a.zohoMessageId && !b.zohoMessageId) return -1;
    if (!a.zohoMessageId && b.zohoMessageId) return 1;

    // Priority 3: Oldest message (created first)
    return new Date(a.createdAt) - new Date(b.createdAt);
  })[0];
}

export {
  areMessagesDuplicates,
  findMatchingDatabaseMessage,
  deduplicateZohoVoiceMessages,
  identifyDuplicateMessages,
  getPreferredMessage,
  DUPLICATE_TIME_WINDOW_MINUTES
};