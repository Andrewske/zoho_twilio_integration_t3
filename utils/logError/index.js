import posthog from 'posthog-js';

/**
 * Logs an error message and details, and reports it to PostHog.
 * 
 * @param {Object} params - The parameters for the logError function.
 * @param {string} params.message - The error message.
 * @param {Error} params.error - The error object.
 * @param {string} [params.level='error'] - The error level.
 * @param {Object} params.data - Additional data related to the error.
 */
export const logError = ({ message, error = null, level = 'error', data = {} }) => {
    if (!isValidErrorParams(message, error)) {
        console.error('Invalid parameters for logError');
        return;
    }

    const timestamp = new Date().toISOString();
    const errorData = formatErrorData(data);

    try {
        logToConsole(timestamp, message, errorData, error);
        reportToPostHog(error, level, errorData, message);
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

function reportToPostHog(error, level, data, message) {
    // Only capture if PostHog is initialized (not on localhost/dev)
    if (typeof window !== 'undefined' && posthog.__loaded) {
        posthog.captureException(error, {
            level,
            message,
            extra_data: data,
            timestamp: new Date().toISOString()
        });
    }
}