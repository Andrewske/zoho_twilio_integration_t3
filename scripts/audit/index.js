/**
 * Audit Orchestrator
 * Wires all modules together into a cohesive audit flow
 */

import { prisma } from '../lib/prisma.js';
import {
  getMessagesInDateRange,
  getTasksInDateRange,
  groupMessagesByContact,
} from './queries.js';
import { lookupAndFetchTimeline, getApiDelay, delay } from './zohoTimeline.js';
import { buildContactProfile } from './analyzer.js';
import { generateMarkdownReport } from './formatters/markdown.js';
import { generateJsonReport } from './formatters/json.js';

// Shared credentials studio ID (philip_admin) - for all non-Southlake studios
const SHARED_CREDENTIALS_STUDIO_ID = 'b2395e84-3a4b-4792-a67b-57ddb8d7e744';

/**
 * Get Southlake studio ID from database
 * @returns {Promise<string|null>}
 */
const getSouthlakeStudioId = async () => {
  const studio = await prisma.studio.findFirst({
    where: { name: 'Southlake' },
    select: { id: true },
  });
  return studio?.id || null;
};

/**
 * Run the full audit process
 * @param {Object} options
 * @param {Date} options.fromDate - Start date
 * @param {Date} options.toDate - End date
 * @param {string} [options.studioFilter] - Optional studio name filter
 * @param {boolean} [options.verbose] - Enable detailed logging
 */
export const runAudit = async ({ fromDate, toDate, studioFilter, verbose }) => {
  const ZOHO_API_DELAY = getApiDelay();

  try {
    // 1. Query local database
    console.log('Fetching messages from database...');
    const messages = await getMessagesInDateRange(fromDate, toDate, studioFilter);
    console.log(`  Found ${messages.length} messages`);

    console.log('Fetching tasks from database...');
    const tasks = await getTasksInDateRange(fromDate, toDate, studioFilter);
    console.log(`  Found ${tasks.length} tasks`);

    const groupedMessages = groupMessagesByContact(messages);
    console.log(`  Grouped into ${groupedMessages.size} unique contacts`);

    if (groupedMessages.size === 0) {
      console.log('\nNo contacts found in date range. Nothing to audit.');
      return;
    }

    // 2. Determine token groups
    const southlakeStudioId = await getSouthlakeStudioId();
    if (verbose) {
      console.log(`  Southlake studio ID: ${southlakeStudioId || 'not found'}`);
      console.log(`  Shared credentials studio ID: ${SHARED_CREDENTIALS_STUDIO_ID}`);
    }

    // 3. Build profiles with Zoho timeline
    console.log(`\nProcessing ${groupedMessages.size} contacts...`);
    const profiles = [];
    let processedCount = 0;
    let apiErrors = 0;

    for (const [phone, contactMessages] of groupedMessages.entries()) {
      processedCount++;

      if (processedCount % 10 === 0 || verbose) {
        console.log(`  Progress: ${processedCount}/${groupedMessages.size}`);
      }

      // Determine which credentials to use
      const studioName = contactMessages[0]?.Studio?.name;
      const isSouthlake = studioName === 'Southlake';
      const studioIdForToken = isSouthlake && southlakeStudioId
        ? southlakeStudioId
        : SHARED_CREDENTIALS_STUDIO_ID;

      if (verbose) {
        console.log(`  [${phone}] Studio: ${studioName}, using ${isSouthlake ? 'Southlake' : 'shared'} credentials`);
      }

      // Fetch Zoho timeline
      let zohoData = { contact: null, timeline: [], error: null };
      try {
        zohoData = await lookupAndFetchTimeline(phone, studioIdForToken, verbose);

        // Rate limiting
        await delay(ZOHO_API_DELAY);
      } catch (err) {
        if (err.status === 429) {
          console.log('  Rate limit hit (429), waiting 60 seconds...');
          await delay(60000);

          // Retry once
          try {
            zohoData = await lookupAndFetchTimeline(phone, studioIdForToken, verbose);
          } catch (retryErr) {
            console.warn(`  Failed to fetch timeline for ${phone} after retry: ${retryErr.message}`);
            zohoData.error = retryErr.message;
            apiErrors++;
          }
        } else {
          if (verbose) {
            console.warn(`  Failed to fetch timeline for ${phone}: ${err.message}`);
          }
          zohoData.error = err.message;
          apiErrors++;
        }
      }

      // Correlate tasks with this contact
      const contactTasks = tasks.filter(t =>
        t.contactId === zohoData.contact?.id ||
        contactMessages.some(m => m.id === t.messageId)
      );

      // Build profile
      const profile = buildContactProfile(contactMessages, zohoData, contactTasks);
      profiles.push(profile);
    }

    console.log(`\nProcessed ${profiles.length} contacts (${apiErrors} API errors)`);

    // 4. Generate reports
    console.log('\nGenerating reports...');
    const dateRange = { from: fromDate, to: toDate };

    const mdPath = await generateMarkdownReport(profiles, dateRange);
    console.log(`  Markdown: ${mdPath}`);

    const jsonPath = await generateJsonReport(profiles, dateRange);
    console.log(`  JSON: ${jsonPath}`);

    // 5. Print summary
    const passCount = profiles.filter(p => p.verdict === 'PASS').length;
    const reviewCount = profiles.filter(p => p.verdict === 'NEEDS REVIEW').length;
    const noActionCount = profiles.filter(p => p.verdict === 'OK - NO ACTION EXPECTED').length;

    console.log(`\n${'='.repeat(50)}`);
    console.log('Audit Complete');
    console.log(`${'='.repeat(50)}`);
    console.log(`Contacts processed: ${profiles.length}`);
    console.log(`  ✅ PASS: ${passCount}`);
    console.log(`  ⚠️  NEEDS REVIEW: ${reviewCount}`);
    console.log(`  ➖ NO ACTION EXPECTED: ${noActionCount}`);
    console.log(`\nReports saved to audit-reports/`);

    if (reviewCount > 0) {
      console.log(`\n⚠️  ${reviewCount} contact(s) need manual review.`);
    }

  } catch (error) {
    console.error('\nFatal error during audit:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};
