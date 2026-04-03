/**
 * Zoho Timeline Fetcher
 * Fetch timeline data from Zoho CRM API for leads and contacts
 *
 * Note: This module uses standalone implementations to avoid Next.js-specific
 * imports (like ~/ aliases) that don't work in direct node execution.
 */

import { prisma } from '../../utils/prisma.js';

const ZOHO_API_DELAY = 2000; // 2 second delay between API calls

/**
 * Format mobile number for Zoho search
 * Matches the main application's formatMobile behavior (10 plain digits)
 * @param {string} mobile - Raw phone number
 * @returns {string} Normalized phone number (10 digits)
 */
const formatMobile = (mobile) => {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  // Return last 10 digits (removes country code if present)
  return digits.slice(-10);
};

/**
 * Get Zoho account credentials for a studio
 * Standalone implementation that works outside Next.js context
 * @param {string} studioId - Studio ID
 * @returns {Promise<Object>} Account with accessToken and apiDomain
 */
const getZohoAccountStandalone = async (studioId) => {
  const studioAccounts = await prisma.studioAccount.findMany({
    where: { studioId },
    include: { Account: true },
  });

  const zohoAccount = studioAccounts
    .map(sa => sa.Account)
    .find(account => account.platform === 'zoho');

  if (!zohoAccount) {
    throw new Error(`No Zoho account found for studio ${studioId}`);
  }

  if (!zohoAccount.accessToken) {
    throw new Error(`No access token for studio ${studioId}`);
  }

  return {
    accessToken: zohoAccount.accessToken,
    apiDomain: zohoAccount.apiDomain || 'https://www.zohoapis.com',
  };
};

/**
 * Search for contact in Zoho by mobile number
 * @param {string} mobile - Phone number to search
 * @param {string} accessToken - Zoho OAuth token
 * @param {string} apiDomain - Zoho API domain
 * @param {string} zohoModule - 'Leads' or 'Contacts'
 * @returns {Promise<Object|null>} Contact data or null
 */
const searchZohoModule = async (mobile, accessToken, apiDomain, zohoModule) => {
  const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
  const criteria = `(Mobile:equals:${formatMobile(mobile)})`;
  const url = `${apiDomain}/crm/v5/${zohoModule}/search?fields=${fields}&criteria=${criteria}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle non-OK responses
    if (!response.ok) {
      if (response.status === 204) {
        // No content = not found (Zoho returns 204 for no search results)
        return null;
      }

      if (response.status === 429) {
        const error = new Error('Rate limit exceeded');
        error.status = 429;
        throw error;
      }

      // For other errors (401, 403, 500, etc.), try to get error details
      const contentType = response.headers.get('content-type');
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;

      if (contentType?.includes('application/json')) {
        try {
          const errorBody = await response.json();
          errorMessage += ` - ${errorBody.message || errorBody.code || JSON.stringify(errorBody)}`;
        } catch (e) {
          // If we can't parse error JSON, just use status
        }
      }

      throw new Error(errorMessage);
    }

    // Parse response body
    const text = await response.text();

    // Handle empty response body
    if (!text || text.trim().length === 0) {
      return null;
    }

    // Parse JSON with error handling
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response from Zoho: ${e.message} (body length: ${text.length})`);
    }

    // Check for Zoho API error codes in successful responses
    if (data.code === 'NO_DATA' || data.code === 'INVALID_DATA') {
      return null;
    }

    // Extract contact from response
    const contact = data?.data?.[0];

    if (contact) {
      return {
        ...contact,
        isLead: zohoModule === 'Leads',
      };
    }

    return null;

  } catch (error) {
    // Re-throw rate limit errors for special handling
    if (error.status === 429) {
      throw error;
    }

    // Wrap and throw other errors with context
    const contextError = new Error(`Zoho ${zohoModule} search failed for ${formatMobile(mobile)}: ${error.message}`);
    contextError.originalError = error;
    throw contextError;
  }
};

/**
 * Lookup contact in Zoho (searches Leads then Contacts)
 * @param {string} mobile - Phone number
 * @param {string} studioId - Studio ID for credentials
 * @returns {Promise<Object|null>} Contact with isLead flag
 */
const lookupContactStandalone = async (mobile, studioId) => {
  const { accessToken, apiDomain } = await getZohoAccountStandalone(studioId);

  // Search Leads first, then Contacts
  // If we get an error (auth, network, etc), it will bubble up
  // If we get null (not found), we continue to next module
  for (const module of ['Leads', 'Contacts']) {
    try {
      const contact = await searchZohoModule(mobile, accessToken, apiDomain, module);
      if (contact) {
        return contact;
      }
    } catch (error) {
      // If it's a rate limit or auth error, propagate immediately
      // These should stop the entire search
      if (error.status === 429 || error.message?.includes('401') || error.message?.includes('Authentication')) {
        throw error;
      }

      // For other errors in one module, try the next module
      // (e.g., if Leads search fails but Contacts might work)
      console.warn(`Warning: Error searching ${module} for ${mobile}: ${error.message}`);
    }
  }

  return null;
};

/**
 * Lookup contact and fetch their Zoho timeline
 * @param {string} phoneNumber - Contact phone number
 * @param {string} studioId - Studio ID for credentials
 * @param {boolean} verbose - Enable detailed logging
 * @returns {Promise<{contact: Object|null, timeline: Array, error?: string}>}
 */
export const lookupAndFetchTimeline = async (phoneNumber, studioId, verbose = false) => {
  try {
    if (verbose) {
      console.log(`  [Timeline] Looking up ${phoneNumber} with studio ${studioId}`);
    }

    // Use standalone lookupContact to get Zoho record
    const contact = await lookupContactStandalone(phoneNumber, studioId);

    if (!contact) {
      if (verbose) {
        console.log(`  [Timeline] Contact not found for ${phoneNumber}`);
      }
      return { contact: null, timeline: [], error: 'Contact not found in Zoho' };
    }

    if (verbose) {
      console.log(`  [Timeline] Found ${contact.isLead ? 'Lead' : 'Contact'}: ${contact.Full_Name} (${contact.id})`);
    }

    // Fetch timeline for this record
    const { accessToken, apiDomain } = await getZohoAccountStandalone(studioId);
    const timeline = await fetchContactTimeline(
      contact.id,
      contact.isLead,
      accessToken,
      apiDomain,
      verbose
    );

    return { contact, timeline };
  } catch (error) {
    // Extract more useful error information
    const errorMessage = error.message || error.toString();
    const errorType = error.status === 429 ? 'Rate limit exceeded' :
                     errorMessage.includes('401') ? 'Authentication failed (token expired)' :
                     errorMessage.includes('403') ? 'Access forbidden' :
                     errorMessage.includes('Invalid JSON') ? 'Invalid API response' :
                     errorMessage;

    if (verbose) {
      console.log(`  [Timeline] Error for ${phoneNumber}: ${errorType}`);
      if (error.originalError) {
        console.log(`  [Timeline] Original error: ${error.originalError.message}`);
      }
    }

    return { contact: null, timeline: [], error: errorType };
  }
};

/**
 * Fetch timeline from Zoho API
 * @param {string} contactId - Zoho record ID
 * @param {boolean} isLead - Whether the record is a Lead
 * @param {string} accessToken - Zoho OAuth token
 * @param {string} apiDomain - Zoho API domain
 * @param {boolean} verbose - Enable detailed logging
 * @returns {Promise<Array>} Parsed timeline events
 */
export const fetchContactTimeline = async (contactId, isLead, accessToken, apiDomain, verbose = false) => {
  const module = isLead ? 'Leads' : 'Contacts';
  const url = `${apiDomain}/crm/v8/${module}/${contactId}/__timeline`;

  if (verbose) {
    console.log(`  [Timeline] Fetching timeline: ${url}`);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Propagate rate limit error for caller to handle
        const error = new Error('Rate limit exceeded');
        error.status = 429;
        throw error;
      }

      // Try to get error details from response
      const contentType = response.headers.get('content-type');
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;

      if (contentType?.includes('application/json')) {
        try {
          const errorBody = await response.json();
          errorMessage += ` - ${errorBody.message || errorBody.code || JSON.stringify(errorBody)}`;
        } catch (e) {
          // Fallback to text if JSON parsing fails
          const errorText = await response.text();
          if (errorText) {
            errorMessage += ` - ${errorText.substring(0, 200)}`;
          }
        }
      } else {
        const errorText = await response.text();
        if (errorText) {
          errorMessage += ` - ${errorText.substring(0, 200)}`;
        }
      }

      throw new Error(`Timeline fetch failed: ${errorMessage}`);
    }

    // Parse response with error handling
    const text = await response.text();

    if (!text || text.trim().length === 0) {
      if (verbose) {
        console.log(`  [Timeline] Empty response body, returning empty timeline`);
      }
      return [];
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON in timeline response: ${e.message}`);
    }

    return parseTimelineEvents(data, verbose);

  } catch (error) {
    // Re-throw rate limit errors for special handling
    if (error.status === 429) {
      throw error;
    }

    // Wrap and throw other errors with context
    if (verbose) {
      console.log(`  [Timeline] Error fetching timeline for ${contactId}: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Parse Zoho timeline API response into structured events
 * @param {Object} apiResponse - Raw API response
 * @param {boolean} verbose - Enable detailed logging
 * @returns {Array} Parsed timeline events
 */
export const parseTimelineEvents = (apiResponse, verbose = false) => {
  const rawEvents = apiResponse?.data || apiResponse?.__timeline?.data || [];

  if (verbose) {
    console.log(`  [Timeline] Parsing ${rawEvents.length} raw events`);
  }

  const events = rawEvents.map(event => {
    const parsed = {
      timestamp: event.audited_time ? new Date(event.audited_time) : null,
      action: event.action || 'unknown',
      source: event.source || 'unknown',
      doneBy: event.done_by?.name || 'unknown',
      details: '',
      rawEvent: event,
    };

    // Extract field history details
    if (event.field_history) {
      const fieldHistory = Array.isArray(event.field_history)
        ? event.field_history
        : [event.field_history];

      const changes = fieldHistory.map(fh => {
        const apiName = fh.api_name || fh.field_label || 'unknown';
        const oldValue = fh._value?.old_value ?? fh.old_value ?? '';
        const newValue = fh._value?.new_value ?? fh.new_value ?? '';
        return `${apiName}: ${oldValue} → ${newValue}`;
      });

      parsed.details = changes.join('; ');

      // Special handling for Lead_Status changes
      const statusChange = fieldHistory.find(fh =>
        fh.api_name === 'Lead_Status' || fh.field_label === 'Lead_Status'
      );
      if (statusChange) {
        parsed.statusChange = {
          from: statusChange._value?.old_value ?? statusChange.old_value ?? '',
          to: statusChange._value?.new_value ?? statusChange.new_value ?? '',
        };
      }
    }

    // Extract related record info (tasks, notes, etc.)
    if (event.record) {
      const recordModule = event.record.module?.api_name || 'unknown';
      const recordName = event.record.name || '';
      const recordId = event.record.id || '';

      parsed.relatedRecord = {
        module: recordModule,
        name: recordName,
        id: recordId,
      };

      if (recordModule === 'Tasks') {
        parsed.taskCreated = {
          name: recordName,
          id: recordId,
        };
      }

      if (!parsed.details) {
        parsed.details = `${recordModule}: ${recordName}`;
      }
    }

    return parsed;
  });

  // Filter out events with no useful information
  const filteredEvents = events.filter(e => e.timestamp);

  if (verbose) {
    console.log(`  [Timeline] Extracted ${filteredEvents.length} valid events`);
  }

  return filteredEvents;
};

/**
 * Wait for rate limiting
 * @param {number} ms - Milliseconds to wait
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get the API delay constant
 * @returns {number} Delay in milliseconds
 */
export const getApiDelay = () => ZOHO_API_DELAY;
