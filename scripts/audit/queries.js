/**
 * Database Queries Module
 * Query messages and tasks for audit processing
 */

import { prisma } from '../lib/prisma.js';

/**
 * Get messages within specified date range
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @param {string} [studioName] - Optional studio name filter
 * @returns {Promise<Array>} Messages with Studio relation
 */
export const getMessagesInDateRange = async (fromDate, toDate, studioName = null) => {
  const whereClause = {
    createdAt: {
      gte: fromDate,
      lte: toDate,
    },
  };

  if (studioName) {
    whereClause.Studio = {
      name: studioName,
    };
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    include: {
      Studio: {
        select: {
          id: true,
          name: true,
          smsPhone: true,
          twilioPhone: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return messages;
};

/**
 * Get tasks within specified date range
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @param {string} [studioName] - Optional studio name filter
 * @returns {Promise<Array>} Tasks with Studio relation
 */
export const getTasksInDateRange = async (fromDate, toDate, studioName = null) => {
  const whereClause = {
    createdAt: {
      gte: fromDate,
      lte: toDate,
    },
  };

  if (studioName) {
    whereClause.Studio = {
      name: studioName,
    };
  }

  const tasks = await prisma.zohoTask.findMany({
    where: whereClause,
    include: {
      Studio: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return tasks;
};

/**
 * Normalize phone number for grouping
 * Strips all non-digit characters and handles +1 prefix
 * @param {string} phone - Phone number to normalize
 * @returns {string} Normalized phone number
 */
const normalizePhone = (phone) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // Remove leading 1 if 11 digits (US country code)
  return digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;
};

/**
 * Group messages by contact phone number
 * @param {Array} messages - Array of messages
 * @returns {Map<string, Array>} Map of phone number to messages
 */
export const groupMessagesByContact = (messages) => {
  const grouped = new Map();

  for (const message of messages) {
    // Determine contact phone (opposite of studio phone)
    const studioPhones = [
      normalizePhone(message.Studio?.smsPhone),
      normalizePhone(message.Studio?.twilioPhone),
    ].filter(Boolean);

    const fromNormalized = normalizePhone(message.fromNumber);
    const toNormalized = normalizePhone(message.toNumber);

    // Contact phone is the one that's NOT the studio phone
    let contactPhone;
    if (studioPhones.includes(fromNormalized)) {
      contactPhone = toNormalized;
    } else {
      contactPhone = fromNormalized;
    }

    if (!contactPhone) continue;

    if (!grouped.has(contactPhone)) {
      grouped.set(contactPhone, []);
    }
    grouped.get(contactPhone).push(message);
  }

  return grouped;
};

/**
 * Infer message direction from studio phone comparison
 * @param {Object} message - Message with Studio relation
 * @returns {'in' | 'out'} Direction - 'out' if from studio, 'in' if to studio
 */
export const inferMessageDirection = (message) => {
  const studioPhones = [
    normalizePhone(message.Studio?.smsPhone),
    normalizePhone(message.Studio?.twilioPhone),
  ].filter(Boolean);

  const fromNormalized = normalizePhone(message.fromNumber);

  // If fromNumber matches studio phone, it's outbound
  return studioPhones.includes(fromNormalized) ? 'out' : 'in';
};
