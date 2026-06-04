// Backfill the Twilio -> Zoho Analytics message log.
//
// The daily cron (app/api/twilio/get_messages) only pulls the last 7 days, so it
// can't recover the ~2-month gap created when the Next 16 upgrade broke the push
// (commit 2831768, 2026-04-02). This walks week-by-week from --since to now and
// re-imports each window. The Zoho import is updateadd/matchingColumns:['sid'], so
// every window is idempotent — a failed run reruns via --since with zero dupes.
//
// Must run through the no-server-only loader so the 'use server' action imports work:
//   node --import tsx/esm --import ./scripts/lib/register-no-server-only.mjs \
//     scripts/backfill-zoho-analytics.mjs --dry
//   node --import tsx/esm --import ./scripts/lib/register-no-server-only.mjs \
//     scripts/backfill-zoho-analytics.mjs --since 2026-04-02
//
// Flags:
//   --since <YYYY-MM-DD>  start of backfill window. Default 2026-04-02 (the break).
//   --dry                 fetch + count only; skip the Zoho POST.

import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}

const { getTwilioAccount, getTwilioClient } = await import('../actions/twilio/index.js');
const { getZohoAccount } = await import('../actions/zoho/index.js');
const { uploadMessagesToZoho } = await import('../utils/zohoAnalytics/index.js');

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const dryRun = args.includes('--dry');
const since = new Date(`${arg('--since', '2026-04-02')}T00:00:00.000Z`);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Cap rows per Zoho POST. Weeks can spike to ~14k messages; a single import that
// large risks Zoho's payload limit / timeout, and onError:'abort' fails the whole
// window. updateadd/sid keeps sub-batches idempotent.
const CHUNK = 2000;

const pad = (n) => n.toString().padStart(2, '0');
const formatDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const toRow = (message) => ({
  sid: message.sid,
  from: message.from,
  to: message.to,
  body: message.body,
  status: message.status,
  date: formatDate(message.dateSent),
  direction: message.direction,
});

const twilioAccount = await getTwilioAccount(process.env.ADMIN_STUDIO_ID);
const client = await getTwilioClient(twilioAccount);
const zoho = await getZohoAccount({ studioId: process.env.ADMIN_STUDIO_ID });

console.log(`Backfill ${formatDate(since)} -> now  (dryRun=${dryRun})`);

let grandTotal = 0;
let windowStart = since;
const now = new Date();

while (windowStart < now) {
  const windowEnd = new Date(Math.min(windowStart.getTime() + WEEK_MS, now.getTime()));

  const messages = await client.messages
    .list({ dateSentAfter: windowStart, dateSentBefore: windowEnd, pageSize: 1000 })
    .then((list) => list.filter((m) => m.dateSent).map(toRow));

  const label = `${formatDate(windowStart)} -> ${formatDate(windowEnd)}`;

  if (messages.length && !dryRun) {
    for (let i = 0; i < messages.length; i += CHUNK) {
      await uploadMessagesToZoho(messages.slice(i, i + CHUNK), { accessToken: zoho.accessToken });
    }
  }

  grandTotal += messages.length;
  console.log(`  [${dryRun ? 'count' : 'pushed'}] ${label}: ${messages.length}  (running ${grandTotal})`);

  windowStart = windowEnd;
}

console.log(`Done. ${grandTotal} messages ${dryRun ? 'counted' : 'pushed'}.`);
process.exit(0);
