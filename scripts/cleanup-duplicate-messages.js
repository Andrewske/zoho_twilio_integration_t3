/**
 * Cleanup script for duplicate Zoho Voice messages
 * 
 * This script identifies and removes duplicate messages from the database,
 * keeping the most complete version (with zohoMessageId and studioId if available).
 * 
 * Usage:
 * node scripts/cleanup-duplicate-messages.js [--dry-run] [--customer-number=1234567890]
 */

import { PrismaClient } from '@prisma/client';
import { identifyDuplicateMessages, getPreferredMessage } from '../utils/messageDeduplication.js';

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const customerNumberArg = args.find(arg => arg.startsWith('--customer-number='));
const customerNumber = customerNumberArg ? customerNumberArg.split('=')[1] : null;

/**
 * Main cleanup function
 */
async function cleanupDuplicateMessages() {
  try {
    console.log('🧹 Starting duplicate message cleanup...');
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE CLEANUP'}`);
    
    if (customerNumber) {
      console.log(`Scope: Single customer ${customerNumber}`);
    } else {
      console.log('Scope: All customers');
    }

    // Find duplicate message groups
    const duplicateGroups = await identifyDuplicateMessages(prisma, customerNumber);
    
    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicate messages found!');
      return;
    }

    console.log(`\n🔍 Found ${duplicateGroups.length} groups of duplicate messages:`);
    
    let totalDuplicates = 0;
    let totalToDelete = 0;
    
    for (let i = 0; i < duplicateGroups.length; i++) {
      const group = duplicateGroups[i];
      const preferred = getPreferredMessage(group);
      const toDelete = group.filter(msg => msg.id !== preferred.id);
      
      totalDuplicates += group.length;
      totalToDelete += toDelete.length;
      
      console.log(`\n--- Duplicate Group ${i + 1} ---`);
      console.log(`Message: "${group[0].message.substring(0, 50)}..."`);
      console.log(`From: ${group[0].fromNumber} → To: ${group[0].toNumber}`);
      console.log(`Duplicates found: ${group.length}`);
      console.log(`Preferred message: ${preferred.id} (zohoId: ${preferred.zohoMessageId || 'null'}, studioId: ${preferred.studioId || 'null'})`);
      
      if (!isDryRun) {
        // Delete duplicate messages
        for (const duplicate of toDelete) {
          console.log(`  🗑️ Deleting message ${duplicate.id}`);
          await prisma.message.delete({ where: { id: duplicate.id } });
        }
      } else {
        // Show what would be deleted
        toDelete.forEach(duplicate => {
          console.log(`  [DRY RUN] Would delete message ${duplicate.id} (zohoId: ${duplicate.zohoMessageId || 'null'})`);
        });
      }
    }

    console.log('\n📊 Cleanup Summary:');
    console.log(`Total duplicate messages: ${totalDuplicates}`);
    console.log(`Messages to keep: ${duplicateGroups.length}`);
    console.log(`Messages ${isDryRun ? 'to delete' : 'deleted'}: ${totalToDelete}`);
    
    if (isDryRun) {
      console.log('\n💡 This was a dry run. To perform actual cleanup, run without --dry-run flag');
    } else {
      console.log('\n✅ Cleanup completed successfully!');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
Usage: node scripts/cleanup-duplicate-messages.js [options]

Options:
  --dry-run                    Show what would be deleted without actually deleting
  --customer-number=NUMBER     Limit cleanup to specific customer number
  
Examples:
  node scripts/cleanup-duplicate-messages.js --dry-run
  node scripts/cleanup-duplicate-messages.js --customer-number=9799226822 --dry-run
  node scripts/cleanup-duplicate-messages.js
`);
}

// Handle help flag
if (args.includes('--help') || args.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run the cleanup
cleanupDuplicateMessages();