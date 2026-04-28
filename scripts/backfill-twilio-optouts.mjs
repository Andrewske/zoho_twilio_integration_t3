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

// Pull distinct STOPs (both providers, all-time) with earliest timestamp.
const stops = await prisma.message.findMany({
  where: {
    message: { mode: 'insensitive', equals: 'stop' },
  },
  select: { fromNumber: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
});

const firstStopByPhone = new Map();
for (const s of stops) {
  if (!firstStopByPhone.has(s.fromNumber)) {
    firstStopByPhone.set(s.fromNumber, s.createdAt);
  }
}

console.log(`distinct stop-repliers: ${firstStopByPhone.size}`);
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
