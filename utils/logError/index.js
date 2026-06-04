import posthog from 'posthog-js';

/**
 * Logs an error message and details, and reports it to PostHog.
 *
 * On the server (no `window`), reports via the posthog-node sink so cron jobs,
 * API routes, and server actions are no longer silent. On the client, uses the
 * posthog-js browser SDK. Returns a promise; await it in serverless contexts
 * (route catch blocks) to guarantee the event flushes before the function freezes.
 *
 * @param {Object} params - The parameters for the logError function.
 * @param {string} params.message - The error message.
 * @param {Error} params.error - The error object.
 * @param {string} [params.level='error'] - The error level.
 * @param {Object} params.data - Additional data related to the error.
 */
export const logError = async ({ message, error = null, level = 'error', data = {} }) => {
    if (!isValidErrorParams(message, error)) {
        console.error('Invalid parameters for logError');
        return;
    }

    const timestamp = new Date().toISOString();
    const errorData = formatErrorData(data);

    try {
        logToConsole(timestamp, message, errorData, error);
        await reportToPostHog(error, level, errorData, message);
    } catch (captureError) {
        console.error('Error logging error:', captureError)
    }

};

function isValidErrorParams(message, error) {
    return typeof message === 'string' && message.trim() !== '' && error instanceof Error;
}

function formatErrorData(data) {
    return typeof data === 'object' && data !== null ? JSON.stringify({ ...data }) : data;
}

function logToConsole(timestamp, message, errorData, error) {
    console.log(`${timestamp} - ${message} - ${errorData} - ${error?.message} - ${error?.code}`);
}

async function reportToPostHog(error, level, data, message) {
    // Server: no window. Route through the posthog-node sink (otherwise silent).
    // Dynamic import keeps posthog-node (node:fs) out of client bundles — a static
    // import poisons any 'use client' module that touches logError.
    if (typeof window === 'undefined') {
        const { captureServerException } = await import('~/utils/postHogServer');
        await captureServerException(error, null, { level, message, extra_data: data });
        return;
    }
    // Client: only capture once posthog-js is initialized (not on localhost/dev).
    if (posthog.__loaded) {
        posthog.captureException(error, {
            level,
            message,
            extra_data: data,
            timestamp: new Date().toISOString()
        });
    }
}