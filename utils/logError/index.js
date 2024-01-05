'use server';
import * as Sentry from "@sentry/nextjs";

/**
 * Logs an error message and details, and reports it to Sentry.
 * 
 * @param {Object} params - The parameters for the logError function.
 * @param {string} params.message - The error message.
 * @param {Error} params.error - The error object.
 * @param {string} [params.level='error'] - The error level.
 * @param {Object} params.data - Additional data related to the error.
 */
export const logError = ({ message, error, level = 'error', data }) => {
    if (!isValidErrorParams(message, error)) {
        console.error('Invalid parameters for logError');
        return;
    }

    const timestamp = new Date().toISOString();
    const errorData = formatErrorData(data);

    logToConsole(timestamp, message, errorData, level);
    reportToSentry(error, level, data);
};

function isValidErrorParams(message, error) {
    return typeof message === 'string' && message.trim() !== '' && error instanceof Error;
}

function formatErrorData(data) {
    return typeof data === 'object' && data !== null ? JSON.stringify(data) : data;
}

function logToConsole(timestamp, message, errorData) {
    console.log(`${timestamp} - ${message} - ${errorData}`);
}

function reportToSentry(error, level, data) {
    Sentry.withScope((scope) => {
        scope.setLevel(level);
        scope.setExtra('data', data);
        Sentry.captureException(error);
    });
}