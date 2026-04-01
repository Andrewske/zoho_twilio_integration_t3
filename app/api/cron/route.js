import { NextResponse } from 'next/server';

import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { sendFollowUp } from '~/actions/zoho/sendFollowUp';
import { getStudioFromPhoneNumber, getStudioFromZohoId } from '~/actions/zoho/studio';
import { createTask } from '~/actions/zoho/tasks';
import { createUnlinkedTask } from '~/actions/zoho/tasks';
import { logError } from '~/utils/logError';
import { isYesMessage, isStopMessage, isAdminNumber, hasReceivedFollowUpMessage } from '~/utils/messageHelpers';
import { notify } from '~/utils/notify';
import { prisma } from '~/utils/prisma';

export const maxDuration = 60;

const BATCH_LIMIT = 20;
const RETRY_ESCALATE = 10;
const RETRY_MAX = 50;
const LOOKBACK_HOURS = 24;

// GET /api/cron
// Processes all unprocessed inbound messages: contact lookup, task creation, follow-ups.
// The webhook only saves messages — this cron does all the smart work.
// Runs every 5 minutes via vercel.json.
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  const cronRun = await prisma.cronRun.create({ data: {} });
  let stats = { found: 0, processed: 0, tasksCreated: 0, tasksLinked: 0, errors: 0, errorDetails: [] };

  try {
    const messages = await getUnprocessedMessages();
    stats.found = messages.length;

    if (!messages.length) {
      await completeCronRun(cronRun.id, stats);
      return NextResponse.json({ ok: true, message: 'No unprocessed messages', cronRunId: cronRun.id });
    }

    // Process sequentially to avoid concurrent token refresh for same Zoho account
    for (const message of messages) {
      try {
        const result = await processMessage(message);
        stats.processed++;
        if (result.taskCreated) stats.tasksCreated++;
        if (result.taskLinked) stats.tasksLinked++;
      } catch (error) {
        stats.errors++;
        stats.errorDetails.push({ messageId: message.id, error: error.message });
        logError({
          message: 'Cron: error processing message',
          error,
          level: 'error',
          data: { messageId: message.id, fromNumber: `***${message.fromNumber.slice(-4)}` },
        });
        // Increment retryCount even on error so we don't get stuck
        await prisma.message.update({
          where: { id: message.id },
          data: { retryCount: { increment: 1 } },
        }).catch(() => {}); // Don't let this error mask the original
      }
    }

    await completeCronRun(cronRun.id, stats);
    return NextResponse.json({ ok: true, cronRunId: cronRun.id, ...stats });
  } catch (error) {
    logError({ message: 'Error in cron', error, level: 'error' });
    await completeCronRun(cronRun.id, { ...stats, errors: stats.errors + 1 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

async function getUnprocessedMessages() {
  return prisma.message.findMany({
    where: {
      twilioMessageId: { not: null },
      isWelcomeMessage: false,
      isFollowUpMessage: false,
      studioId: null,
      retryCount: { lt: RETRY_MAX },
      createdAt: { gt: new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000) },
      ZohoTask: { none: {} },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_LIMIT,
  });
}

async function processMessage(message) {
  const result = { taskCreated: false, taskLinked: false };

  // Resolve studio from the number that received the message
  let studio = await getStudioFromPhoneNumber(message.toNumber);

  // Admin number: resolve the real studio from the contact's Owner
  // Cache the contact to avoid a second lookup below
  let contact = null;
  if (isAdminNumber(message.toNumber)) {
    contact = await lookupContact({ mobile: message.fromNumber, studioId: studio?.id });
    if (contact?.Owner?.id) {
      studio = await getStudioFromZohoId(contact.Owner.id);
    }
  }

  if (!studio) {
    logError({
      message: 'Cron: studio not found for message',
      level: 'warn',
      data: { messageId: message.id, toNumber: message.toNumber },
    });
    await prisma.message.update({
      where: { id: message.id },
      data: { retryCount: { increment: 1 } },
    });
    return result;
  }

  // Reuse cached contact from admin-number lookup, or do a fresh lookup
  if (!contact) {
    contact = await lookupContact({ mobile: message.fromNumber, studioId: studio.id });
  }

  // Update message with studio/contact attribution + increment retryCount
  await prisma.message.update({
    where: { id: message.id },
    data: {
      studioId: studio.id,
      contactId: contact?.id,
      retryCount: { increment: 1 },
    },
  });

  // Contact not found — handle based on message type
  if (!contact) {
    if (isYesMessage(message.message)) {
      try {
        await createUnlinkedTask({ studio, message });
        result.taskCreated = true;
      } catch (error) {
        logError({ message: 'Cron: failed to create unlinked task', error, level: 'error', data: { messageId: message.id } });
      }
      await notify({ type: 'CONTACT_NOT_FOUND', data: { phone: message.fromNumber, studio: studio.name, messageId: message.id } });
    }
    if (message.retryCount >= RETRY_ESCALATE) {
      await notify({ type: 'RETRY_EXHAUSTED', data: { phone: message.fromNumber, studio: studio.name, messageId: message.id, retryCount: message.retryCount } });
    }
    return result;
  }

  // Contact found — process based on message type
  if (isYesMessage(message.message)) {
    if (!(await hasReceivedFollowUpMessage(contact))) {
      await sendFollowUp({ contact, studio, to: message.fromNumber, from: message.toNumber, msg: message.message });
      result.taskCreated = true;
    }
  } else if (isStopMessage(message.message)) {
    // Stop is already handled by webhook + Twilio's Advanced Opt-Out
    // This catches stop messages where the webhook couldn't find the contact
    await smsOptOut({ studio, contact });
  } else {
    // Regular message — create task
    const taskData = await createTask({
      studioId: studio.id,
      zohoId: studio.zohoId,
      contact,
      message: { to: message.toNumber, from: message.fromNumber, msg: message.message },
    });

    if (taskData?.zohoTaskId) {
      await prisma.zohoTask.create({
        data: {
          zohoTaskId: taskData.zohoTaskId,
          messageId: message.id,
          studioId: studio.id,
          contactId: contact.id,
          taskSubject: taskData.taskSubject,
          taskStatus: taskData.taskStatus,
        },
      });
      result.taskCreated = true;
    }
  }

  return result;
}

async function completeCronRun(id, stats) {
  await prisma.cronRun.update({
    where: { id },
    data: {
      completedAt: new Date(),
      messagesFound: stats.found,
      messagesProcessed: stats.processed,
      tasksCreated: stats.tasksCreated,
      tasksLinked: stats.tasksLinked,
      errors: stats.errors,
      errorDetails: stats.errorDetails.length ? JSON.stringify(stats.errorDetails) : null,
    },
  });
}
