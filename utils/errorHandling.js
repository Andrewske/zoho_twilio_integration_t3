/**
 * Error handling utilities
 * Centralizes error handling patterns and reduces boilerplate code
 */

import { logError } from './logError/index.js';

/**
 * Higher-order function that wraps operations with consistent error handling
 * @param {Function} operation - The async function to wrap
 * @param {Object} options - Configuration options
 * @param {string} options.context - Context description for logging
 * @param {string} options.level - Error level (default: 'error')
 * @param {boolean} options.rethrow - Whether to rethrow the error (default: true)
 * @returns {Function} Wrapped function with error handling
 */
export const withErrorHandling = (operation, options = {}) => {
  const {
    context = operation.name || 'unknown operation',
    level = 'error',
    rethrow = true
  } = options;

  return async (...args) => {
    try {
      return await operation(...args);
    } catch (error) {
      // Extract meaningful data from arguments for logging
      const logData = args.length > 0 && typeof args[0] === 'object' 
        ? args[0] 
        : { args: args.slice(0, 3) }; // Limit args to prevent huge logs

      logError({
        message: `Error in ${context}`,
        error,
        level,
        data: logData
      });

      if (rethrow) {
        throw error;
      }
      return null;
    }
  };
};

/**
 * Specialized error handler for database operations
 * @param {Function} operation - Database operation to wrap
 * @param {string} entityName - Name of the entity being operated on
 * @returns {Function} Wrapped database operation
 */
export const withDbErrorHandling = (operation, entityName) => {
  return withErrorHandling(operation, {
    context: `database ${entityName} operation`,
    level: 'error'
  });
};

/**
 * Specialized error handler for API operations
 * @param {Function} operation - API operation to wrap
 * @param {string} apiName - Name of the API being called
 * @param {boolean} isWarning - Whether failures should be warnings instead of errors
 * @returns {Function} Wrapped API operation
 */
export const withApiErrorHandling = (operation, apiName, isWarning = false) => {
  return withErrorHandling(operation, {
    context: `${apiName} API operation`,
    level: isWarning ? 'warning' : 'error'
  });
};

/**
 * Error handler for message operations (sending, fetching, etc.)
 * @param {Function} operation - Message operation to wrap
 * @param {string} provider - Provider name (twilio, zoho_voice, etc.)
 * @returns {Function} Wrapped message operation
 */
export const withMessageErrorHandling = (operation, provider) => {
  return withErrorHandling(operation, {
    context: `${provider} message operation`,
    level: 'error'
  });
};

/**
 * Error handler for account/auth operations
 * @param {Function} operation - Account operation to wrap
 * @param {string} platform - Platform name (zoho, twilio, etc.)
 * @returns {Function} Wrapped account operation
 */
export const withAccountErrorHandling = (operation, platform) => {
  return withErrorHandling(operation, {
    context: `${platform} account operation`,
    level: 'error'
  });
};

/**
 * Async retry wrapper with exponential backoff
 * @param {Function} operation - Operation to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {Function} options.shouldRetry - Function to determine if error should trigger retry
 * @returns {Function} Wrapped function with retry logic
 */
export const withRetry = (operation, options = {}) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true
  } = options;

  return async (...args) => {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation(...args);
      } catch (error) {
        lastError = error;
        
        // Don't retry on last attempt or if shouldRetry returns false
        if (attempt === maxRetries || !shouldRetry(error)) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  };
};

/**
 * Safe async operation wrapper that never throws
 * Useful for operations where you want to continue on failure
 * @param {Function} operation - Operation to make safe
 * @param {*} defaultValue - Default value to return on error
 * @returns {Function} Safe wrapped function
 */
export const makeSafe = (operation, defaultValue = null) => {
  return withErrorHandling(operation, {
    context: `safe ${operation.name || 'operation'}`,
    level: 'warning',
    rethrow: false
  });
};

/**
 * Validation wrapper that throws meaningful errors
 * @param {Function} validator - Validation function that returns true/false or throws
 * @param {string} errorMessage - Error message for validation failure
 * @returns {Function} Validation wrapper
 */
export const withValidation = (validator, errorMessage) => {
  return (data) => {
    try {
      const isValid = validator(data);
      if (!isValid) {
        throw new Error(errorMessage);
      }
      return true;
    } catch (error) {
      if (error.message === errorMessage) {
        throw error;
      }
      throw new Error(`Validation failed: ${errorMessage} - ${error.message}`);
    }
  };
};

// Common error types for standardized handling
export const ErrorTypes = {
  VALIDATION: 'ValidationError',
  AUTHENTICATION: 'AuthenticationError',
  AUTHORIZATION: 'AuthorizationError',
  NOT_FOUND: 'NotFoundError',
  RATE_LIMIT: 'RateLimitError',
  NETWORK: 'NetworkError',
  DATABASE: 'DatabaseError',
  API: 'ApiError'
};

/**
 * Create a typed error with additional metadata
 * @param {string} type - Error type from ErrorTypes
 * @param {string} message - Error message
 * @param {Object} metadata - Additional error metadata
 * @returns {Error} Typed error
 */
export const createTypedError = (type, message, metadata = {}) => {
  const error = new Error(message);
  error.type = type;
  error.metadata = metadata;
  return error;
};