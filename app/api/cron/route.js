import { NextResponse } from 'next/server';

import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { sendFollowUp } from '~/actions/zoho/sendFollowUp';
import { findAdminStudioByPhone, getStudioFromPhoneNumber, getStudioFromZohoId } from '~/actions/zoho/studio';
import { createTask, createUnlinkedTask } from '~/actions/zoho/tasks';
import { logError } from '~/utils/logError';
import { isYesMessage, isStopMessage, hasReceivedFollowUpMessage } from '~/utils/messageHelpers';
import { notify } from '~/utils/notify';
import { captureServerEvent } from '~/utils/postHogServer';
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

  const url = new URL(request.url);
  const dryRun = process.env.NODE_ENV !== 'production' && url.searchParams.get('dryRun') === 'true';

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
        const result = await processMessage(message, dryRun);
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
        await captureServerEvent('CRON_ERROR', { messageId: message.id, error: error.message });
        // Increment retryCount even on error so we don't get stuck
        await prisma.message.update({
          where: { id: message.id },
          data: { retryCount: { increment: 1 } },
        }).catch(() => {}); // Don't let this error mask the original
      }
    }

    await completeCronRun(cronRun.id, stats);
    return NextResponse.json({ ok: true, cronRunId: cronRun.id, dryRun, ...stats });
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

async function processMessage(message, dryRun = false) {
  const result = { taskCreated: false, taskLinked: false };

  // Resolve physical (non-admin) studio from the number that received the message.
  // On shared-phone setups (multiple studios on one Twilio number) we also grab
  // the admin studio, which carries a broader-visibility Zoho account used for
  // contact lookup across all studios behind that phone.
  let studio = await getStudioFromPhoneNumber(message.toNumber);
  const adminStudio = await findAdminStudioByPhone(message.toNumber);

  let contact = null;
  if (adminStudio) {
    contact = await lookupContact({ mobile: message.fromNumber, studioId: adminStudio.id });
    if (contact?.Owner?.id) {
      const owned = await getStudioFromZohoId(contact.Owner.id);
      if (owned) studio = owned;
    }
  }

  if (!studio) {
    logError({
      message: 'Cron: studio not found for message',
      error: new Error(`Studio not found for toNumber: ${message.toNumber}`),
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
      if (!dryRun) {
        try {
          await createUnlinkedTask({ studio, message });
          result.taskCreated = true;
        } catch (error) {
          logError({ message: 'Cron: failed to create unlinked task', error, level: 'error', data: { messageId: message.id } });
        }
        await notify({ type: 'CONTACT_NOT_FOUND', data: { phone: message.fromNumber, studio: studio.name, messageId: message.id } });
      }
    }
    if (!dryRun && message.retryCount + 1 >= RETRY_ESCALATE) {
      await notify({ type: 'RETRY_EXHAUSTED', data: { phone: message.fromNumber, studio: studio.name, messageId: message.id, retryCount: message.retryCount + 1 } });
    }
    return result;
  }

  // Contact found — process based on message type
  if (isYesMessage(message.message)) {
    if (!dryRun && !(await hasReceivedFollowUpMessage(contact))) {
      await sendFollowUp({ contact, studio, to: message.fromNumber, from: message.toNumber, msg: message.message });
      result.taskCreated = true;
    }
  } else if (isStopMessage(message.message)) {
    // Stop is already handled by webhook + Twilio's Advanced Opt-Out
    // This catches stop messages where the webhook couldn't find the contact
    if (!dryRun) await smsOptOut({ studio, contact });
  } else {
    // Regular message — create task
    if (!dryRun) {
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
