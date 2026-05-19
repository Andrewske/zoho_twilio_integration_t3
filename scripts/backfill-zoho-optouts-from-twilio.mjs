// Reverse-sync Twilio carrier opt-outs into Zoho SMS_Opt_Out=true.
//
// Source of truth: Twilio Messages list filtered by Error 21610 (attempt to
// send to unsubscribed). Twilio's Consent Management API has no GET surface,
// so this is the only way to enumerate carrier-known opt-outs.
//
// Usage (must run through the no-server-only loader so action imports work):
//   node --import tsx/esm --import ./scripts/lib/register-no-server-only.mjs \
//     scripts/backfill-zoho-optouts-from-twilio.mjs --dry-run --days 30 --limit 50
//   node --import tsx/esm --import ./scripts/lib/register-no-server-only.mjs \
//     scripts/backfill-zoho-optouts-from-twilio.mjs --days 365
//
// Idempotent: flipOptOutIfStale skips contacts already opted out.

import { prisma } from './lib/prisma.js';
import { listOptOutBlockedMessages } from '../actions/twilio/listOptOutBlockedMessages.js';
import { flipOptOutIfStale } from '../actions/zoho/contact/flipOptOutIfStale.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const days = readNumberArg('--days', 365);
const limit = readNumberArg('--limit', null);

function readNumberArg(flag, defaultValue) {
  const i = args.indexOf(flag);
  if (i < 0) return defaultValue;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : defaultValue;
}

// Concurrency limiter. Each worker calls Zoho serially; with 5 workers and
// ~400ms/call average, effective rate ~750/min — well under Enterprise tier's
// 25-concurrent cap. Limiter naturally spaces calls so no fixed sleep needed.
const CONCURRENCY = 5;

const createLimiter = (concurrency) => {
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < concurrency && queue.length) {
      const { fn, resolve, reject } = queue.shift();
      active += 1;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      drain();
    });
};

const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
console.log(JSON.stringify({ event: 'backfill_start', days, sinceDate: sinceDate.toISOString(), dryRun, limit }));

// Dedup Twilio accounts by clientId — DB has 3 rows but only 2 distinct
// Account SIDs (philip_admin row duplicated under two studio mappings).
const allTwilio = await prisma.account.findMany({ where: { platform: 'twilio' } });
const seenClientIds = new Set();
const accounts = [];
for (const a of allTwilio) {
  if (seenClientIds.has(a.clientId)) continue;
  seenClientIds.add(a.clientId);
  accounts.push(a);
}
console.log(JSON.stringify({ event: 'twilio_accounts', total_rows: allTwilio.length, distinct_sids: accounts.length }));

// Pull blocked messages from every distinct Twilio account, union the To phones.
const distinct = new Set();
for (const account of accounts) {
  try {
    const hits = await listOptOutBlockedMessages({ account, sinceDate });
    let added = 0;
    for (const h of hits) {
      if (!h.to) continue;
      if (!distinct.has(h.to)) added += 1;
      distinct.add(h.to);
    }
    console.log(JSON.stringify({ event: 'twilio_pull', account_id: account.id, account_sid: account.clientId, hits: hits.length, new_distinct: added }));
  } catch (error) {
    console.log(JSON.stringify({ event: 'twilio_pull_error', account_id: account.id, error: error.message }));
  }
}
console.log(JSON.stringify({ event: 'distinct_phones', count: distinct.size }));

// Pick a single studio for Zoho lookup creds. Opt-out field is global on the
// Zoho record, so the studio choice only affects which OAuth account is used
// for the API call. Resolve once per run.
const activeStudios = await prisma.studio.findMany({
  where: { active: true },
  select: { id: true, name: true, zohoId: true },
});
const lookupStudio = activeStudios.find((s) => s.zohoId);
if (!lookupStudio) {
  console.log(JSON.stringify({ event: 'fatal', reason: 'no_active_studio_with_zohoId' }));
  await prisma.$disconnect();
  process.exit(1);
}
console.log(JSON.stringify({ event: 'lookup_studio', studio_id: lookupStudio.id, name: lookupStudio.name }));

const phones = [...distinct];
const sample = limit != null ? phones.slice(0, limit) : phones;
console.log(JSON.stringify({ event: 'processing', total: sample.length, full_distinct: phones.length }));

const totals = { scanned: 0, flipped: 0, flipped_dryrun: 0, already: 0, not_found: 0, lookup_error: 0, update_error: 0 };
const limit5 = createLimiter(CONCURRENCY);
let completed = 0;

const processPhone = async (phone) => {
  const result = dryRun
    ? await flipOptOutIfStaleReadOnly({ phone, lookupStudioId: lookupStudio.id })
    : await flipOptOutIfStale({ phone, lookupStudioId: lookupStudio.id });

  totals.scanned += 1;
  totals[result.outcome] = (totals[result.outcome] || 0) + 1;
  completed += 1;
  if (completed <= 10 || completed % 25 === 0) {
    console.log(JSON.stringify({ event: 'progress', i: completed, total: sample.length, phone_tail: phone.slice(-4), outcome: result.outcome, contact_id: result.contactId }));
  }
};

await Promise.all(sample.map((phone) => limit5(() => processPhone(phone))));

console.log(JSON.stringify({ event: 'backfill_done', dryRun, totals }));
await prisma.$disconnect();

// Dry-run variant: do the lookup (read-only), classify the would-be outcome,
// but never call updateContact. Mirrors flipOptOutIfStale's decision tree.
async function flipOptOutIfStaleReadOnly({ phone, lookupStudioId }) {
  const { lookupContact } = await import('../actions/zoho/contact/lookupContact/index.js');
  let contact;
  try {
    contact = await lookupContact({ mobile: phone, studioId: lookupStudioId });
  } catch {
    return { outcome: 'lookup_error' };
  }
  if (!contact) return { outcome: 'not_found' };
  if (contact.SMS_Opt_Out) return { outcome: 'already', contactId: contact.id };
  return { outcome: 'flipped_dryrun', contactId: contact.id };
}
