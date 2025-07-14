/**
 * Message transformation utilities
 * Centralizes all message format conversion logic
 */

import { PhoneFormatter } from './phoneNumber.js';

/**
 * Message transformation utilities
 */
export const MessageTransformers = {
  /**
   * Transform database message to UI format (ChatWindow compatible)
   * Replaces scattered transformation logic across multiple files
   * @param {Object} dbMessage - Message from database
   * @param {string} formattedMobile - Contact's mobile number (normalized)
   * @param {Object} phoneToStudioName - Phone to studio name mapping
   * @returns {Object} UI-formatted message
   */
  dbToUI(dbMessage, formattedMobile, phoneToStudioName = {}) {
    const isFromCustomer = dbMessage.fromNumber === formattedMobile;
    const studioPhone = isFromCustomer ? dbMessage.toNumber : dbMessage.fromNumber;
    const studioName = dbMessage.Studio?.name || phoneToStudioName[studioPhone] || 'Unknown';
    
    return {
      id: dbMessage.id,
      to: PhoneFormatter.normalize(dbMessage.toNumber),
      from: PhoneFormatter.normalize(dbMessage.fromNumber),
      body: dbMessage.message,
      date: dbMessage.createdAt,
      fromStudio: !isFromCustomer,
      studioName,
      provider: dbMessage.provider || 'twilio',
      twilioMessageId: dbMessage.twilioMessageId,
      zohoMessageId: dbMessage.zohoMessageId,
      isWelcomeMessage: dbMessage.isWelcomeMessage || false,
      isFollowUpMessage: dbMessage.isFollowUpMessage || false
    };
  },

  /**
   * Transform Zoho Voice SMS log to database format
   * Replaces transformSmsLogToMessage function
   * @param {Object} smsLog - SMS log from Zoho Voice API
   * @param {string} studioId - Studio ID
   * @param {string} contactId - Contact ID from Zoho CRM
   * @returns {Object} Database-formatted message
   */
  zohoVoiceToDb(smsLog, studioId, contactId) {
    const isIncoming = smsLog.messageType === 'INCOMING';
    
    return {
      fromNumber: PhoneFormatter.normalize(isIncoming ? smsLog.customerNumber : smsLog.senderId),
      toNumber: PhoneFormatter.normalize(isIncoming ? smsLog.senderId : smsLog.customerNumber),
      studioId,
      contactId,
      message: smsLog.message || '',
      provider: 'zoho_voice',
      zohoMessageId: smsLog.logid,
      isWelcomeMessage: false,
      isFollowUpMessage: false,
      createdAt: new Date(smsLog.submittedTime)
    };
  },

  /**
   * Transform Twilio message to UI format
   * @param {Object} twilioMessage - Message from Twilio API
   * @param {Object} phoneToStudioName - Phone to studio name mapping
   * @param {boolean} fromStudio - Whether message is from studio
   * @returns {Object} UI-formatted message
   */
  twilioToUI(twilioMessage, phoneToStudioName = {}, fromStudio = true) {
    const normalizedFrom = PhoneFormatter.normalize(twilioMessage.from);
    const normalizedTo = PhoneFormatter.normalize(twilioMessage.to);
    
    return {
      to: normalizedTo,
      from: normalizedFrom,
      body: twilioMessage.body,
      date: twilioMessage.dateSent,
      fromStudio,
      studioName: fromStudio 
        ? (phoneToStudioName[normalizedFrom] || 'Unknown')
        : (phoneToStudioName[normalizedTo] || 'Unknown'),
      provider: 'twilio',
      twilioMessageId: twilioMessage.sid,
      id: fromStudio ? 1 : 0
    };
  },

  /**
   * Transform Twilio message to database format
   * @param {Object} twilioMessage - Message from Twilio API
   * @param {string} studioId - Studio ID
   * @param {string} contactId - Contact ID
   * @param {boolean} fromStudio - Whether message is from studio
   * @returns {Object} Database-formatted message
   */
  twilioToDb(twilioMessage, studioId, contactId, fromStudio = true) {
    return {
      fromNumber: PhoneFormatter.normalize(twilioMessage.from),
      toNumber: PhoneFormatter.normalize(twilioMessage.to),
      studioId,
      contactId,
      message: twilioMessage.body,
      provider: 'twilio',
      twilioMessageId: twilioMessage.sid,
      isWelcomeMessage: false,
      isFollowUpMessage: false,
      createdAt: twilioMessage.dateSent || new Date()
    };
  },

  /**
   * Transform Zoho Voice SMS log to UI format (for immediate display)
   * @param {Object} smsLog - SMS log from Zoho Voice API
   * @param {Object} phoneToStudioName - Phone to studio name mapping
   * @returns {Object} UI-formatted message
   */
  zohoVoiceToUI(smsLog, phoneToStudioName = {}) {
    const isIncoming = smsLog.messageType === 'INCOMING';
    const fromNumber = PhoneFormatter.normalize(isIncoming ? smsLog.customerNumber : smsLog.senderId);
    const toNumber = PhoneFormatter.normalize(isIncoming ? smsLog.senderId : smsLog.customerNumber);
    
    return {
      id: smsLog.logid,
      to: toNumber,
      from: fromNumber,
      body: smsLog.message || '',
      date: new Date(smsLog.submittedTime),
      fromStudio: !isIncoming,
      studioName: !isIncoming 
        ? (phoneToStudioName[fromNumber] || 'Unknown')
        : (phoneToStudioName[toNumber] || 'Unknown'),
      provider: 'zoho_voice',
      zohoMessageId: smsLog.logid,
      isWelcomeMessage: false,
      isFollowUpMessage: false
    };
  },

  /**
   * Bulk transform database messages to UI format
   * @param {Array} dbMessages - Array of database messages
   * @param {string} contactMobile - Contact's mobile number
   * @param {Object} phoneToStudioName - Phone to studio name mapping
   * @returns {Array} Array of UI-formatted messages
   */
  bulkDbToUI(dbMessages, contactMobile, phoneToStudioName = {}) {
    const formattedMobile = PhoneFormatter.normalize(contactMobile);
    
    return dbMessages.map(dbMessage => 
      this.dbToUI(dbMessage, formattedMobile, phoneToStudioName)
    );
  },

  /**
   * Bulk transform Zoho Voice logs to database format
   * @param {Array} smsLogs - Array of SMS logs from Zoho Voice
   * @param {Object} phoneToStudio - Phone to studio mapping
   * @param {string} contactId - Contact ID
   * @returns {Array} Array of database-formatted messages
   */
  bulkZohoVoiceToDb(smsLogs, phoneToStudio, contactId) {
    return smsLogs.map(log => {
      const isIncoming = log.messageType === 'INCOMING';
      const studioPhone = isIncoming ? log.senderId : log.customerNumber;
      const studio = phoneToStudio[studioPhone];
      
      return {
        fromNumber: PhoneFormatter.normalize(isIncoming ? log.customerNumber : log.senderId),
        toNumber: PhoneFormatter.normalize(isIncoming ? log.senderId : log.customerNumber),
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
  }
};

// Legacy function exports for backward compatibility
export const transformSmsLogToMessage = MessageTransformers.zohoVoiceToDb;