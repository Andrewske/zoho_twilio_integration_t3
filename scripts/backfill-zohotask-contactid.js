#!/usr/bin/env node

/**
 * Backfill contactId on ZohoTask records
 *
 * Fetches each ZohoTask where contactId IS NULL from Zoho API,
 * extracts Who_Id (contact) or What_Id (lead), and updates the DB record.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfill-zohotask-contactid.js             # dry-run (default)
 *   node --import tsx/esm scripts/backfill-zohotask-contactid.js --dry-run   # explicit dry-run
 *   node --import tsx/esm scripts/backfill-zohotask-contactid.js --execute   # write to DB
 */

import { prisma } from '../utils/prisma.js';

const CONCURRENCY = 10;

const parseArgs = (args) => ({ dryRun: !args.includes('--execute') });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getZohoAccount = async (studioId) => {
  const studioAccounts = await prisma.studioAccount.findMany({
    where: { studioId },
    include: { Account: true },
  });
  const account = studioAccounts.map(sa => sa.Account).find(a => a.platform === 'zoho');
  if (!account) throw new Error(`No Zoho account for studio ${studioId}`);
  if (!account.accessToken) throw new Error(`No access token for studio ${studioId}`);
  return { apiDomain: account.apiDomain, accessToken: account.accessToken };
};

// Cache tokens per studio
const tokenCache = new Map();
const getToken = async (studioId) => {
  if (!tokenCache.has(studioId)) {
    tokenCache.set(studioId, await getZohoAccount(studioId));
  }
  return tokenCache.get(studioId);
};

const fetchZohoTask = async ({ apiDomain, accessToken, zohoTaskId }, retries = 3) => {
  const url = `${apiDomain}/crm/v5/Tasks/${zohoTaskId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });

  if (response.status === 404) return null;

  if (response.status === 429) {
    if (retries === 0) throw new Error('Rate limited after retries');
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '10', 10);
    await sleep(retryAfter * 1000);
    return fetchZohoTask({ apiDomain, accessToken, zohoTaskId }, retries - 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zoho API ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data?.data?.[0] ?? null;
};

const extractContactId = (task) => {
  if (task?.Who_Id?.id) return { contactId: task.Who_Id.id, source: 'Who_Id' };
  if (task?.What_Id?.id) return { contactId: task.What_Id.id, source: 'What_Id' };
  return null;
};

const processRecord = async (record, dryRun) => {
  const { apiDomain, accessToken } = await getToken(record.studioId);
  const zohoTask = await fetchZohoTask({ apiDomain, accessToken, zohoTaskId: record.zohoTaskId });

  if (!zohoTask) return { status: 'not_found', id: record.id, zohoTaskId: record.zohoTaskId };

  const result = extractContactId(zohoTask);
  if (!result) return { status: 'no_contact', id: record.id, zohoTaskId: record.zohoTaskId };

  if (dryRun) {
    return { status: 'dry_run', id: record.id, zohoTaskId: record.zohoTaskId, ...result };
  }

  await prisma.zohoTask.update({
    where: { id: record.id },
    data: { contactId: result.contactId },
  });

  return { status: 'updated', id: record.id, zohoTaskId: record.zohoTaskId, ...result };
};

// Run up to `concurrency` promises at a time
const runWithConcurrency = async (items, concurrency, fn) => {
  const results = [];
  let idx = 0;

  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
};

const main = async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));

  console.log('Backfill ZohoTask.contactId');
  console.log('===========================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE (will update DB)'}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const records = await prisma.zohoTask.findMany({
    where: { contactId: null },
    select: { id: true, zohoTaskId: true, studioId: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${records.length} ZohoTask records with contactId = NULL\n`);

  if (!records.length) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  const stats = { updated: 0, dry_run: 0, not_found: 0, no_contact: 0, errors: 0 };
  let completed = 0;

  const results = await runWithConcurrency(records, CONCURRENCY, async (record) => {
    try {
      const result = await processRecord(record, dryRun);
      completed++;
      if (completed % 50 === 0) process.stdout.write(`  Progress: ${completed}/${records.length}\n`);
      return result;
    } catch (error) {
      completed++;
      return { status: 'error', id: record.id, zohoTaskId: record.zohoTaskId, error: error.message };
    }
  });

  for (const result of results) {
    stats[result.status] = (stats[result.status] ?? 0) + 1;

    if (result.status === 'updated' || result.status === 'dry_run') {
      const prefix = result.status === 'dry_run' ? '[DRY-RUN]' : '[UPDATED]';
      console.log(`${prefix} id=${result.id} -> contactId=${result.contactId} (via ${result.source})`);
    } else if (result.status === 'not_found') {
      console.log(`[NOT FOUND] id=${result.id} zohoTaskId=${result.zohoTaskId}`);
    } else if (result.status === 'no_contact') {
      console.log(`[NO CONTACT] id=${result.id} zohoTaskId=${result.zohoTaskId}`);
    } else if (result.status === 'error') {
      console.error(`[ERROR] id=${result.id} zohoTaskId=${result.zohoTaskId} — ${result.error}`);
    }
  }

  console.log('\nSummary');
  console.log('-------');
  console.log(`${dryRun ? 'Would update' : 'Updated'}:     ${dryRun ? stats.dry_run : stats.updated}`);
  console.log(`Not in Zoho:   ${stats.not_found}`);
  console.log(`No contact:    ${stats.no_contact}`);
  console.log(`Errors:        ${stats.errors}`);

  if (dryRun && (stats.dry_run ?? 0) > 0) {
    console.log('\nRun with --execute to apply these changes.');
  }

  await prisma.$disconnect();
};

main().catch((error) => {
  console.error('Fatal:', error.message);
  process.exit(1);
});
