/**
 * Cleanup script for duplicate Zoho Voice messages
 *
 * Removes duplicate Zoho Voice Message rows (same content + phones + within
 * 5 min) caused by Bug A (parse missed `response.send.logid`) and Bug B
 * (dedup NaN). Both fixed in commits 6c1a603 / 67ef764 / b62f310.
 *
 * Safety rules:
 * - Skip groups with multiple distinct non-null logids — those are not the
 *   send+sync pattern and may be genuine separate sends.
 * - Carry studioId / contactId from deleted rows onto the keeper if it is
 *   missing them (the sync row, which we keep for its logid, has no
 *   studioId).
 * - Repoint ZohoTask.messageId FK from deleted rows onto the keeper to
 *   avoid Restrict throws.
 * - Wrap each group in a transaction so partial failures roll back.
 *
 * Usage:
 *   node scripts/cleanup-duplicate-messages.js [--dry-run] [--customer-number=1234567890]
 */

import { PrismaClient } from '../prisma/generated/prisma/client/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { identifyDuplicateMessages, getPreferredMessage } from '../utils/messageDeduplication.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const customerNumberArg = args.find(arg => arg.startsWith('--customer-number='));
const customerNumber = customerNumberArg ? customerNumberArg.split('=')[1] : null;

function hasMultipleDistinctLogids(group) {
  const ids = new Set(group.map(m => m.zohoMessageId).filter(Boolean));
  return ids.size > 1;
}

function buildKeeperPatch(preferred, toDelete) {
  const patch = {};
  if (!preferred.studioId) {
    const donor = toDelete.find(m => m.studioId);
    if (donor) patch.studioId = donor.studioId;
  }
  if (!preferred.contactId) {
    const donor = toDelete.find(m => m.contactId);
    if (donor) patch.contactId = donor.contactId;
  }
  return patch;
}

async function cleanupDuplicateMessages() {
  try {
    console.log('🧹 Starting duplicate message cleanup...');
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE CLEANUP'}`);
    console.log(`Scope: ${customerNumber ? `customer ${customerNumber}` : 'all customers'}`);

    const allGroups = await identifyDuplicateMessages(prisma, customerNumber);

    if (allGroups.length === 0) {
      console.log('✅ No duplicate messages found!');
      return;
    }

    const skippedGroups = allGroups.filter(hasMultipleDistinctLogids);
    const safeGroups = allGroups.filter(g => !hasMultipleDistinctLogids(g));

    console.log(`\n🔍 Total dup groups: ${allGroups.length}`);
    console.log(`   Safe to clean: ${safeGroups.length}`);
    console.log(`   Skipped (multiple distinct logids): ${skippedGroups.length}`);

    let totalDuplicates = 0;
    let totalToDelete = 0;
    let totalKeeperPatches = 0;
    let totalTaskRepoints = 0;

    for (let i = 0; i < safeGroups.length; i++) {
      const group = safeGroups[i];
      const preferred = getPreferredMessage(group);
      const toDelete = group.filter(msg => msg.id !== preferred.id);
      const toDeleteIds = toDelete.map(m => m.id);

      totalDuplicates += group.length;
      totalToDelete += toDelete.length;

      const keeperPatch = buildKeeperPatch(preferred, toDelete);
      const hasKeeperPatch = Object.keys(keeperPatch).length > 0;
      if (hasKeeperPatch) totalKeeperPatches += 1;

      const linkedTaskCount = await prisma.zohoTask.count({
        where: { messageId: { in: toDeleteIds } }
      });
      totalTaskRepoints += linkedTaskCount;

      console.log(`\n--- Group ${i + 1} ---`);
      console.log(`Message: "${(group[0].message || '').substring(0, 50)}..."`);
      console.log(`From: ${group[0].fromNumber} → To: ${group[0].toNumber}`);
      console.log(`Preferred: ${preferred.id} (zohoId: ${preferred.zohoMessageId || 'null'}, studioId: ${preferred.studioId || 'null'})`);
      if (hasKeeperPatch) {
        console.log(`  ${isDryRun ? '[DRY RUN] Would patch' : '🩹 Patching'} keeper with: ${JSON.stringify(keeperPatch)}`);
      }
      if (linkedTaskCount > 0) {
        console.log(`  ${isDryRun ? '[DRY RUN] Would repoint' : '🔗 Repointing'} ${linkedTaskCount} ZohoTask(s) → ${preferred.id}`);
      }
      for (const dup of toDelete) {
        console.log(`  ${isDryRun ? '[DRY RUN] Would delete' : '🗑️  Deleting'} ${dup.id} (zohoId: ${dup.zohoMessageId || 'null'}, studioId: ${dup.studioId || 'null'})`);
      }

      if (!isDryRun) {
        const ops = [];
        if (hasKeeperPatch) {
          ops.push(prisma.message.update({
            where: { id: preferred.id },
            data: keeperPatch
          }));
        }
        if (linkedTaskCount > 0) {
          ops.push(prisma.zohoTask.updateMany({
            where: { messageId: { in: toDeleteIds } },
            data: { messageId: preferred.id }
          }));
        }
        ops.push(prisma.message.deleteMany({
          where: { id: { in: toDeleteIds } }
        }));
        await prisma.$transaction(ops);
      }
    }

    if (skippedGroups.length > 0) {
      console.log(`\n⚠️  Skipped ${skippedGroups.length} groups with multiple distinct logids (manual review needed). Sample:`);
      for (const group of skippedGroups.slice(0, 5)) {
        const ids = group.map(m => `${m.id}=${m.zohoMessageId || 'null'}`).join(', ');
        console.log(`   - ${group[0].fromNumber} → ${group[0].toNumber}: ${ids}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  Groups processed: ${safeGroups.length} of ${allGroups.length}`);
    console.log(`  Rows in groups: ${totalDuplicates}`);
    console.log(`  Rows ${isDryRun ? 'to delete' : 'deleted'}: ${totalToDelete}`);
    console.log(`  Keepers ${isDryRun ? 'to patch' : 'patched'}: ${totalKeeperPatches}`);
    console.log(`  ZohoTask FKs ${isDryRun ? 'to repoint' : 'repointed'}: ${totalTaskRepoints}`);
    console.log(`  Groups skipped: ${skippedGroups.length}`);

    if (isDryRun) {
      console.log('\n💡 Dry run. Re-run without --dry-run to apply.');
    } else {
      console.log('\n✅ Cleanup complete.');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function showUsage() {
  console.log(`
Usage: node scripts/cleanup-duplicate-messages.js [options]

Options:
  --dry-run                    Show what would change without writing
  --customer-number=NUMBER     Limit cleanup to specific customer number

Examples:
  node scripts/cleanup-duplicate-messages.js --dry-run
  node scripts/cleanup-duplicate-messages.js --customer-number=9799226822 --dry-run
  node scripts/cleanup-duplicate-messages.js
`);
}

if (args.includes('--help') || args.includes('-h')) {
  showUsage();
  process.exit(0);
}

cleanupDuplicateMessages();
