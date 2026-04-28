// One-time historical sync: pushes every distinct STOP-replier from the
// Message table into each configured Twilio account's Consent Management
// opt-out list.
//
// Usage:
//   bun scripts/backfill-twilio-optouts.mjs --dry-run
//   bun scripts/backfill-twilio-optouts.mjs
//
// Idempotent: safe to re-run. Twilio dedups on (contact_id, sender_id).
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Avoid utils/prisma.js (imports server-only which breaks Bun script context).
const { PrismaClient } = await import('../prisma/generated/prisma/client/client.ts');
const { PrismaPg } = await import('@prisma/adapter-pg');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const { addToTwilioOptOut } = await import('../actions/twilio/optOut.js');
const { TWILIO_OPTOUT_SENDER_ACCOUNTS, TWILIO_OPTOUT_SENDER_NUMBERS } = await import(
  '../lib/twilio-optout-config.js'
);

const RATE_LIMIT_PER_MIN = 100;
const SLEEP_MS = Math.ceil(60_000 / RATE_LIMIT_PER_MIN); // 600ms = 100/min

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull all studio inbound numbers so we can filter to true inbound STOPs.
const studios = await prisma.studio.findMany({
  select: { twilioPhone: true, zohoVoicePhone: true },
});
const studioPhones = new Set();
for (const s of studios) {
  if (s.twilioPhone) studioPhones.add(s.twilioPhone);
  if (s.zohoVoicePhone) studioPhones.add(s.zohoVoicePhone);
}

// Pull broadly, filter STOP body in JS to handle whitespace + case variants
// that Prisma's `equals` / `mode: insensitive` skips (e.g. 'Stop ', ' STOP').
// Direction filter: lead → studio (toNumber in studio inbound phones).
// Exclude SMtest synthetic messages (test injections, not real STOPs).
const candidates = await prisma.message.findMany({
  where: {
    toNumber: { in: [...studioPhones] },
    message: { contains: 'top', mode: 'insensitive' }, // narrows; final filter in JS
  },
  select: { fromNumber: true, message: true, createdAt: true, twilioMessageId: true },
  orderBy: { createdAt: 'asc' },
});

const firstStopByPhone = new Map();
for (const r of candidates) {
  if (r.twilioMessageId?.startsWith('SMtest')) continue;
  if (r.message?.toLowerCase().trim() !== 'stop') continue;
  if (!firstStopByPhone.has(r.fromNumber)) {
    firstStopByPhone.set(r.fromNumber, r.createdAt);
  }
}

console.log(`distinct stop-repliers (inbound, real, whitespace-tolerant): ${firstStopByPhone.size}`);

// Safety filter: drop phones that re-opted-in via START / YES / UNSTOP keyword
// AFTER their first STOP. Prisma equals doesn't trim, so pull all candidate
// messages from these phones and filter in JS to handle whitespace variants
// like "Start " (trailing space).
const candidateInbound = await prisma.message.findMany({
  where: {
    fromNumber: { in: [...firstStopByPhone.keys()] },
  },
  select: { fromNumber: true, message: true, createdAt: true },
});
const REOPT_IN_KEYWORDS = new Set(['start', 'unstop', 'yes']);
const reoptInByPhone = new Map();
for (const r of candidateInbound) {
  const normalized = r.message?.toLowerCase().trim();
  if (!REOPT_IN_KEYWORDS.has(normalized)) continue;
  const stoppedAt = firstStopByPhone.get(r.fromNumber);
  if (stoppedAt && r.createdAt > stoppedAt) {
    if (!reoptInByPhone.has(r.fromNumber) || reoptInByPhone.get(r.fromNumber) < r.createdAt) {
      reoptInByPhone.set(r.fromNumber, r.createdAt);
    }
  }
}
console.log(`re-opt-ins detected (skipping): ${reoptInByPhone.size}`);

for (const phone of reoptInByPhone.keys()) firstStopByPhone.delete(phone);
console.log(`final phones to push: ${firstStopByPhone.size}`);
console.log(`sender accounts: ${TWILIO_OPTOUT_SENDER_ACCOUNTS.length}`);
console.log(`mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

if (TWILIO_OPTOUT_SENDER_ACCOUNTS.length === 0) {
  console.log('No sender accounts configured. Exiting.');
  await prisma.$disconnect();
  process.exit(0);
}

const totals = { attempted: 0, success: 0, duplicate: 0, error: 0, skipped: 0 };

for (const accountId of TWILIO_OPTOUT_SENDER_ACCOUNTS) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    console.log(`[skip] account ${accountId} not found`);
    continue;
  }
  const senderId = TWILIO_OPTOUT_SENDER_NUMBERS[accountId];
  console.log(`\n=== syncing to account=${accountId} sender=${senderId} ===`);

  let i = 0;
  for (const [phone, stopAt] of firstStopByPhone) {
    i += 1;
    totals.attempted += 1;

    if (dryRun) {
      if (i <= 5) console.log(`  would push: ${phone} stoppedAt=${stopAt.toISOString()}`);
      continue;
    }

    const result = await addToTwilioOptOut({
      phone,
      account,
      senderId,
      dateOfConsent: stopAt,
    });

    if (result?.skipped) totals.skipped += 1;
    else if (result?.duplicate) totals.duplicate += 1;
    else if (result?.ok) totals.success += 1;
    else totals.error += 1;

    if (i % 100 === 0) console.log(`  progress: ${i}/${firstStopByPhone.size}`);
    await sleep(SLEEP_MS);
  }
}

console.log('\n=== summary ===', totals);
await prisma.$disconnect();
