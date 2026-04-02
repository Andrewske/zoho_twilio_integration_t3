#!/usr/bin/env node

/**
 * Backfill Orphaned Tasks
 * Finds historical "yes" messages that never got a task created and creates them.
 *
 * Requires tsx to resolve the ~/  path aliases used by action modules.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfill-orphaned-tasks.js             # dry-run (default)
 *   node --import tsx/esm scripts/backfill-orphaned-tasks.js --dry-run   # explicit dry-run
 *   node --import tsx/esm scripts/backfill-orphaned-tasks.js --execute   # actually create tasks
 */

import { prisma } from '~/utils/prisma.js';
import { getStudioFromPhoneNumber } from '~/actions/zoho/studio/index.js';
import { lookupContact } from '~/actions/zoho/contact/lookupContact/index.js';
import { sendFollowUp } from '~/actions/zoho/sendFollowUp/index.js';
import { createUnlinkedTask } from '~/actions/zoho/tasks/index.js';
import { hasReceivedFollowUpMessage } from '~/utils/messageHelpers.js';

const YES_PATTERNS = ['yes', 'yes!', 'yes.', 'yes please', 'yeah', 'yep', 'yea', 'sure', 'absolutely'];

const isYesMessage = (msg) => YES_PATTERNS.includes(msg?.toLowerCase().trim());

const parseArgs = (args) => {
  const execute = args.includes('--execute');
  return { dryRun: !execute };
};

const findOrphanedYesMessages = async () => {
  // Fetch all inbound messages that:
  //   - have a twilioMessageId (real inbound SMS)
  //   - are not welcome or follow-up messages
  //   - have no linked ZohoTask
  // No time limit, no retryCount limit — full historical scan.
  const candidates = await prisma.message.findMany({
    where: {
      twilioMessageId: { not: null },
      isWelcomeMessage: false,
      isFollowUpMessage: false,
      ZohoTask: { none: {} },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Filter to yes-pattern messages in JS (simpler than SQL case-insensitive LIKE)
  return candidates.filter((m) => isYesMessage(m.message));
};

const processMessage = async (message, dryRun) => {
  const studio = await getStudioFromPhoneNumber(message.toNumber);

  if (!studio) {
    return { status: 'skipped', reason: 'studio not found', messageId: message.id };
  }

  const contact = await lookupContact({ mobile: message.fromNumber, studioId: studio.id });

  if (!contact) {
    if (dryRun) {
      return { status: 'dry-run', action: 'createUnlinkedTask', messageId: message.id, toNumber: message.toNumber, studioName: studio.name };
    }
    await createUnlinkedTask({ studio, message });
    return { status: 'done', action: 'createUnlinkedTask', messageId: message.id };
  }

  const alreadyFollowedUp = await hasReceivedFollowUpMessage(contact);
  if (alreadyFollowedUp) {
    return {
      status: 'skipped',
      reason: 'contact already received follow-up',
      messageId: message.id,
      contactId: contact.id,
    };
  }

  if (dryRun) {
    return { status: 'dry-run', action: 'sendFollowUp', messageId: message.id, contactId: contact.id, studioName: studio.name };
  }

  await sendFollowUp({
    contact,
    studio,
    to: message.fromNumber,
    from: message.toNumber,
    msg: message.message,
  });

  return { status: 'done', action: 'sendFollowUp', messageId: message.id, contactId: contact.id };
};

const main = async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));

  console.log('Backfill Orphaned Tasks');
  console.log('=======================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'EXECUTE (tasks will be created)'}`);
  console.log('');

  console.log('Querying for orphaned yes messages (no time limit)...');
  const orphans = await findOrphanedYesMessages();
  console.log(`Found ${orphans.length} orphaned yes message(s).`);

  if (!orphans.length) {
    console.log('\nNothing to do.');
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log('\nDry-run preview — run with --execute to actually process these.\n');
  } else {
    console.log('\nProcessing...\n');
  }

  const stats = { total: orphans.length, linkedTasksCreated: 0, unlinkedTasksCreated: 0, skipped: 0, errors: 0 };

  for (const message of orphans) {
    try {
      const result = await processMessage(message, dryRun);

      if (result.status === 'done' || result.status === 'dry-run') {
        const prefix = result.status === 'dry-run' ? '[DRY-RUN]' : '[DONE]';
        if (result.action === 'sendFollowUp') {
          stats.linkedTasksCreated++;
          console.log(`${prefix} messageId=${result.messageId} -> sendFollowUp (contactId=${result.contactId}, studio=${result.studioName})`);
        } else if (result.action === 'createUnlinkedTask') {
          stats.unlinkedTasksCreated++;
          console.log(`${prefix} messageId=${result.messageId} -> createUnlinkedTask (toNumber=${result.toNumber}, studio=${result.studioName})`);
        }
      } else if (result.status === 'skipped') {
        stats.skipped++;
        console.log(`[SKIPPED] messageId=${result.messageId} reason="${result.reason}"`);
      }
    } catch (error) {
      stats.errors++;
      console.error(`[ERROR] messageId=${message.id} -> ${error.message}`);
    }
  }

  const wouldLabel = dryRun ? ' (would create)' : '';
  console.log('\nSummary');
  console.log('-------');
  console.log(`Total orphans found:       ${stats.total}`);
  console.log(`Tasks created (linked):    ${stats.linkedTasksCreated}${wouldLabel}`);
  console.log(`Tasks created (unlinked):  ${stats.unlinkedTasksCreated}${wouldLabel}`);
  console.log(`Skipped:                   ${stats.skipped}`);
  console.log(`Errors:                    ${stats.errors}`);

  if (dryRun && stats.linkedTasksCreated + stats.unlinkedTasksCreated > 0) {
    console.log('\nRun with --execute to actually process these messages.');
  }

  await prisma.$disconnect();
};

main().catch((error) => {
  console.error('Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
