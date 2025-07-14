/**
 * Centralized phone number formatting utilities
 * Eliminates duplicate phone formatting logic across the codebase
 */

/**
 * Core phone number formatter with methods for different providers and uses
 */
export const PhoneFormatter = {
  /**
   * Normalize phone number to 10 digits (removes country code, formatting, etc.)
   * Replaces the existing formatMobile() function
   * @param {string} phone - Raw phone number
   * @returns {string} 10-digit phone number
   */
  normalize: (phone) => {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10);
  },

  /**
   * Format phone number for Twilio API (requires +1 prefix)
   * Replaces formatPhoneForTwilio() function
   * @param {string} phone - Raw phone number
   * @returns {string} Phone number formatted for Twilio (+15098992771)
   */
  forTwilio: (phone) => {
    if (!phone) return '';
    
    const cleaned = phone.replace(/\D/g, '');
    
    // If it's 10 digits, add +1
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    // If it's 11 digits starting with 1, add +
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    // If it already starts with +, return as-is
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // Fallback: add + to whatever we have
    return `+${cleaned}`;
  },

  /**
   * Format phone number for Zoho Voice API (requires 1 prefix, no + symbol)
   * Replaces formatPhoneForZohoVoice() function
   * @param {string} phone - Raw phone number
   * @returns {string} Phone number formatted for Zoho Voice (15098992771)
   */
  forZohoVoice: (phone) => {
    if (!phone) return '';
    
    const cleaned = phone.replace(/\D/g, '');
    
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
  },

  /**
   * Format phone number for display purposes
   * @param {string} phone - Raw phone number
   * @returns {string} Formatted phone number for display (509) 899-2771
   */
  forDisplay: (phone) => {
    const normalized = PhoneFormatter.normalize(phone);
    if (normalized.length !== 10) return phone; // Return original if not 10 digits
    
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  },

  /**
   * Check if two phone numbers are the same (normalized comparison)
   * @param {string} phone1 - First phone number
   * @param {string} phone2 - Second phone number
   * @returns {boolean} True if phones match when normalized
   */
  areEqual: (phone1, phone2) => {
    return PhoneFormatter.normalize(phone1) === PhoneFormatter.normalize(phone2);
  },

  /**
   * Validate if phone number is valid (10 digits after normalization)
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValid: (phone) => {
    const normalized = PhoneFormatter.normalize(phone);
    return normalized.length === 10 && /^\d{10}$/.test(normalized);
  }
};

// Backward compatibility exports (can be removed after migration)
export const formatMobile = PhoneFormatter.normalize;
export const normalizePhoneNumber = PhoneFormatter.normalize;