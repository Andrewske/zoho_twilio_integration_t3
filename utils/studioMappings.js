/**
 * Studio mappings utility - centralized studio query and mapping logic
 * Eliminates duplicate studio query patterns across the codebase
 */

import { prisma } from './prisma.js';
import { PhoneFormatter } from './phoneNumber.js';
import { PrismaSelectors } from './prismaSelectors.js';

/**
 * Centralized studio mappings and queries
 */
export const StudioMappings = {
  /**
   * Get phone number to studio object mapping
   * Replaces scattered studio mapping logic across multiple files
   * @param {boolean} includeInactive - Include inactive studios
   * @returns {Promise<Object>} Phone number to studio object mapping
   */
  async getPhoneToStudioMap(includeInactive = false) {
    const studios = await prisma.studio.findMany({
      where: includeInactive ? {} : { active: true },
      select: PrismaSelectors.studio.withPhones
    });

    const phoneToStudio = {};
    
    studios.forEach(studio => {
      // Map Twilio phone numbers
      if (studio.twilioPhone) {
        const normalizedTwilio = PhoneFormatter.normalize(studio.twilioPhone);
        phoneToStudio[studio.twilioPhone] = studio; // Original format
        phoneToStudio[normalizedTwilio] = studio; // Normalized format
      }
      
      // Map Zoho Voice phone numbers
      if (studio.zohoVoicePhone) {
        const normalizedZoho = PhoneFormatter.normalize(studio.zohoVoicePhone);
        phoneToStudio[studio.zohoVoicePhone] = studio; // Original format
        phoneToStudio[normalizedZoho] = studio; // Normalized format
      }
    });

    return phoneToStudio;
  },

  /**
   * Get phone number to studio name mapping (legacy compatibility)
   * Replaces getAllStudioNames() functions
   * @param {boolean} includeInactive - Include inactive studios
   * @returns {Promise<Object>} Phone number to studio name mapping
   */
  async getStudioNamesDict(includeInactive = false) {
    const phoneToStudio = await this.getPhoneToStudioMap(includeInactive);
    
    const studioNamesDict = {};
    Object.entries(phoneToStudio).forEach(([phone, studio]) => {
      studioNamesDict[phone] = studio.name;
    });
    
    return studioNamesDict;
  },

  /**
   * Get all active studios with their phone numbers
   * @returns {Promise<Array>} Array of studio objects with phone info
   */
  async getAllActiveStudios() {
    return await prisma.studio.findMany({
      where: { active: true },
      select: PrismaSelectors.studio.withPhones
    });
  },

  /**
   * Find studio by phone number (normalized matching)
   * @param {string} phoneNumber - Phone number to search for
   * @param {boolean} includeInactive - Include inactive studios
   * @returns {Promise<Object|null>} Studio object or null
   */
  async findStudioByPhone(phoneNumber, includeInactive = false) {
    const phoneToStudio = await this.getPhoneToStudioMap(includeInactive);
    
    // Try direct match first
    if (phoneToStudio[phoneNumber]) {
      return phoneToStudio[phoneNumber];
    }
    
    // Try normalized match
    const normalized = PhoneFormatter.normalize(phoneNumber);
    return phoneToStudio[normalized] || null;
  },

  /**
   * Get studio by ID with phone numbers
   * @param {string} studioId - Studio ID
   * @returns {Promise<Object|null>} Studio object with phone info
   */
  async getStudioById(studioId) {
    return await prisma.studio.findUnique({
      where: { id: studioId },
      select: PrismaSelectors.studio.withPhones
    });
  },

  /**
   * Get studio by name
   * @param {string} studioName - Studio name
   * @returns {Promise<Object|null>} Studio object with phone info
   */
  async getStudioByName(studioName) {
    return await prisma.studio.findFirst({
      where: { name: studioName },
      select: PrismaSelectors.studio.withPhones
    });
  },

  /**
   * Get studios that have been in conversation with a contact
   * Based on message history
   * @param {string} contactMobile - Contact's mobile number
   * @returns {Promise<Array>} Array of studio objects
   */
  async getStudiosInConversation(contactMobile) {
    const normalizedMobile = PhoneFormatter.normalize(contactMobile);
    
    // Get messages involving this contact
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { fromNumber: normalizedMobile },
          { toNumber: normalizedMobile }
        ]
      },
      include: {
        Studio: {
          select: {
            id: true,
            name: true,
            twilioPhone: true,
            zohoVoicePhone: true,
            active: true
          }
        }
      },
      distinct: ['studioId']
    });

    // Extract unique studios from messages
    const studiosInConvo = messages
      .filter(msg => msg.Studio)
      .map(msg => msg.Studio)
      .filter((studio, index, self) => 
        index === self.findIndex(s => s.id === studio.id)
      );

    return studiosInConvo;
  }
};

// Legacy function exports for backward compatibility
export const getAllStudioNames = StudioMappings.getStudioNamesDict;