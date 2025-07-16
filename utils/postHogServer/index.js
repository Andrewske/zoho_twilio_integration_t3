import { PostHog } from 'posthog-node';

let posthogInstance = null;

/**
 * Get or create a PostHog server instance
 */
export function getPostHogServer() {
  if (!posthogInstance) {
    const enableDev = process.env.NEXT_PUBLIC_POSTHOG_ENABLE_DEV === 'true';
    const isDisabled = process.env.NODE_ENV === 'development' && !enableDev;
    
    posthogInstance = new PostHog(
      process.env.NEXT_PUBLIC_POSTHOG_KEY || '',
      { 
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        // Only disable in development if the dev flag is not set
        disabled: isDisabled
      }
    );
    
    if (enableDev) {
      console.log('PostHog Server initialized with development testing enabled');
    }
  }
  return posthogInstance;
}

/**
 * Capture an exception on the server side
 * @param {Error} error - The error object
 * @param {string} distinctId - Optional user distinct ID
 * @param {Object} properties - Additional properties
 */
export async function captureServerException(error, distinctId = null, properties = {}) {
  try {
    const posthog = getPostHogServer();
    
    await posthog.captureException(error, distinctId, {
      level: 'error',
      runtime: 'nodejs',
      timestamp: new Date().toISOString(),
      ...properties
    });
    
    // Ensure the event is sent before continuing
    await posthog.shutdown();
  } catch (captureError) {
    console.error('Failed to capture server exception:', captureError);
  }
}

/**
 * Capture a server-side event with error context
 * @param {string} event - Event name
 * @param {Object} properties - Event properties
 * @param {string} distinctId - Optional user distinct ID
 */
export async function captureServerEvent(event, properties = {}, distinctId = null) {
  try {
    const posthog = getPostHogServer();
    
    posthog.capture({
      distinctId: distinctId || 'server',
      event,
      properties: {
        timestamp: new Date().toISOString(),
        runtime: 'nodejs',
        ...properties
      }
    });
    
    await posthog.shutdown();
  } catch (captureError) {
    console.error('Failed to capture server event:', captureError);
  }
}

/**
 * Extract distinct ID from PostHog cookie in server context
 * @param {Object} request - Request object with headers
 * @returns {string|null} - Distinct ID or null
 */
export function extractDistinctIdFromRequest(request) {
  if (!request.headers.cookie) {
    return null;
  }

  try {
    const cookieString = request.headers.cookie;
    const postHogCookieMatch = cookieString.match(/ph_[^_]*_posthog=([^;]+)/);
    
    if (postHogCookieMatch && postHogCookieMatch[1]) {
      const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
      const postHogData = JSON.parse(decodedCookie);
      return postHogData.distinct_id;
    }
  } catch (e) {
    console.error('Error extracting distinct ID from PostHog cookie:', e);
  }
  
  return null;
}