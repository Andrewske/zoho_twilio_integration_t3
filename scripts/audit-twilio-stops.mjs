// Audit: per studio, find STOP repliers in our DB, then check Twilio's own
// Messages API for any sends to those numbers AFTER the STOP timestamp.
// Read-only. Reports buckets by status / errorCode.
//
// Usage:
//   node scripts/audit-twilio-stops.mjs [--studio <name>] [--days 30] [--limit 5]
//
// --studio  name substring filter (case-insensitive). Default: all admin studios.
// --days    lookback window for both STOP detection and Twilio message scan. Default 30.
// --limit   cap studios processed (safety). Default 1 — proves it works on one first.

import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const studioFilter = arg('--studio', null);
const days = Number.parseInt(arg('--days', '30'), 10);
const studioLimit = Number.parseInt(arg('--limit', '1'), 10);
const stopProvider = arg('--stop-provider', 'twilio'); // 'twilio' | 'zoho_voice'
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const { prisma } = await import('../utils/prisma.js');
const twilioMod = await import('twilio');
const twilio = twilioMod.default;
const getClient = ({ clientId, clientSecret }) =>
  twilio(clientId, clientSecret, { region: 'US1', edge: 'umatilla' });

const studios = await prisma.studio.findMany({
  where: { twilioPhone: { not: null }, active: true },
  include: { StudioAccount: { include: { Account: true } } },
});

const filtered = studioFilter
  ? studios.filter((s) => s.name.toLowerCase().includes(studioFilter.toLowerCase()))
  : studios;

console.log(`scanning ${Math.min(filtered.length, studioLimit)} of ${filtered.length} studios; window=${days}d since ${since.toISOString()}; stop_provider=${stopProvider}`);

// For zoho_voice path: precompute global ZV STOP-replier set (not tied to studio's twilioPhone).
let zvStops = null;
if (stopProvider === 'zoho_voice') {
  const rows = await prisma.message.findMany({
    where: {
      provider: 'zoho_voice',
      message: { mode: 'insensitive', equals: 'stop' },
      createdAt: { gte: since },
    },
    select: { fromNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  zvStops = new Map();
  for (const r of rows) if (!zvStops.has(r.fromNumber)) zvStops.set(r.fromNumber, r.createdAt);
  console.log(`zoho_voice STOP repliers in window: ${zvStops.size}`);
}

let processed = 0;
const overall = { phones: 0, twilioSends: 0, blocked21610: 0, delivered: 0, undelivered: 0, failed: 0, other: 0 };

for (const studio of filtered) {
  if (processed >= studioLimit) break;

  let firstStopByPhone;
  if (stopProvider === 'zoho_voice') {
    firstStopByPhone = zvStops;
  } else {
    const stops = await prisma.message.findMany({
      where: {
        provider: 'twilio',
        toNumber: studio.twilioPhone,
        message: { mode: 'insensitive', equals: 'stop' },
        createdAt: { gte: since },
      },
      select: { fromNumber: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (stops.length === 0) {
      console.log(`\n[skip] studio=${studio.name} phone=${studio.twilioPhone} — no STOPs in window`);
      continue;
    }
    firstStopByPhone = new Map();
    for (const s of stops) {
      if (!firstStopByPhone.has(s.fromNumber)) firstStopByPhone.set(s.fromNumber, s.createdAt);
    }
  }
  if (firstStopByPhone.size === 0) continue;

  const twilioAccounts = studio.StudioAccount.map((sa) => sa.Account).filter((a) => a.platform === 'twilio');
  if (twilioAccounts.length !== 1) {
    console.log(`\n[skip] studio=${studio.name} — has ${twilioAccounts.length} twilio accounts`);
    continue;
  }
  const account = twilioAccounts[0];
  const client = getClient({ clientId: account.clientId, clientSecret: account.clientSecret });

  console.log(`\nstudio=${studio.name} phone=${studio.twilioPhone} stop_repliers=${firstStopByPhone.size}`);

  let phoneScanned = 0;
  let sendsHit = 0;
  const buckets = { blocked21610: 0, delivered: 0, undelivered: 0, failed: 0, other: 0 };
  const examples = [];

  for (const [phone, stopAt] of firstStopByPhone) {
    phoneScanned += 1;
    let sends;
    try {
      sends = await client.messages.list({
        from: studio.twilioPhone,
        to: phone,
        dateSentAfter: stopAt,
        limit: 50,
      });
    } catch (e) {
      console.log(`  [err] phone=${phone} ${e.message}`);
      continue;
    }
    for (const m of sends) {
      sendsHit += 1;
      const code = m.errorCode != null ? Number.parseInt(m.errorCode, 10) : null;
      let bucket;
      if (code === 21610) bucket = 'blocked21610';
      else if (m.status === 'delivered') bucket = 'delivered';
      else if (m.status === 'undelivered') bucket = 'undelivered';
      else if (m.status === 'failed') bucket = 'failed';
      else bucket = 'other';
      buckets[bucket] += 1;
      if (bucket === 'delivered' && examples.length < 5) {
        examples.push({ to: phone, sid: m.sid, dateSent: m.dateSent, body: (m.body || '').slice(0, 60) });
      }
    }
  }

  console.log(`  phones_scanned=${phoneScanned} twilio_sends_after_stop=${sendsHit}`);
  console.log(`  buckets:`, buckets);
  if (examples.length > 0) {
    console.log(`  example LEAKED deliveries (post-STOP):`);
    for (const e of examples) {
      console.log(`    to=${e.to} sid=${e.sid} sent=${e.dateSent?.toISOString?.() || e.dateSent} body="${e.body}"`);
    }
  }

  overall.phones += phoneScanned;
  overall.twilioSends += sendsHit;
  for (const k of Object.keys(buckets)) overall[k] += buckets[k];
  processed += 1;
}

console.log(`\n=== overall (${processed} studio${processed === 1 ? '' : 's'}) ===`);
console.log(overall);
await prisma.$disconnect();
