import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number.parseInt(args[limitIdx + 1], 10) : Infinity;

const { PrismaClient } = await import('../prisma/generated/prisma/client/client.ts');
const { PrismaPg } = await import('@prisma/adapter-pg');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const twilioMod = await import('twilio');
const twilio = twilioMod.default;
const getTwilioClient = ({ clientId, clientSecret }) =>
  twilio(clientId, clientSecret, { region: 'US1', edge: 'umatilla' });

const THIRTEEN_MONTHS_MS = 13 * 30 * 24 * 60 * 60 * 1000;
const dateSentAfter = new Date(Date.now() - THIRTEEN_MONTHS_MS);

const adminStudios = await prisma.studio.findMany({
  where: { isAdmin: true, twilioPhone: { not: null } },
  include: {
    StudioAccount: {
      include: {
        Account: {
          select: { id: true, platform: true, clientId: true, clientSecret: true },
        },
      },
    },
  },
});

console.log(`admin studios with twilioPhone: ${adminStudios.length}`);

let totalScanned = 0;
let totalSidsFetched = 0;
const updateBuckets = {};
let totalUpdated = 0;

for (const studio of adminStudios) {
  const twilioAccounts = studio.StudioAccount
    .map((sa) => sa.Account)
    .filter((a) => a.platform === 'twilio');

  if (twilioAccounts.length === 0) {
    throw new Error(`Studio ${studio.name} (${studio.id}) has no twilio account`);
  }
  if (twilioAccounts.length > 1) {
    throw new Error(`Studio ${studio.name} (${studio.id}) has multiple twilio accounts`);
  }

  const account = twilioAccounts[0];
  console.log(`\nstudio=${studio.name} phone=${studio.twilioPhone} account=${account.clientId.slice(0, 8)}...`);

  const client = getTwilioClient({
    clientId: account.clientId,
    clientSecret: account.clientSecret,
  });

  const messages = await client.messages.list({
    from: studio.twilioPhone,
    dateSentAfter,
    pageSize: 1000,
  });

  totalSidsFetched += messages.length;
  console.log(`  fetched ${messages.length} sids from twilio`);

  const sidMap = new Map();
  for (const m of messages) {
    sidMap.set(m.sid, {
      status: m.status,
      errorCode: m.errorCode != null ? Number.parseInt(m.errorCode, 10) : null,
      errorMessage: m.errorMessage || null,
    });
  }

  const sids = [...sidMap.keys()];
  if (sids.length === 0) continue;

  const candidates = await prisma.message.findMany({
    where: {
      provider: 'twilio',
      twilioMessageId: { in: sids },
      OR: [{ status: null }, { status: 'delivered' }, { status: 'sending' }],
    },
    select: { id: true, twilioMessageId: true, status: true },
  });

  totalScanned += candidates.length;
  console.log(`  candidate rows in DB: ${candidates.length}`);

  for (const row of candidates) {
    if (totalUpdated >= limit) break;

    const fresh = sidMap.get(row.twilioMessageId);
    if (!fresh) continue;

    const bucket = fresh.status || 'unknown';
    updateBuckets[bucket] = (updateBuckets[bucket] || 0) + 1;

    if (dryRun) {
      totalUpdated += 1;
      continue;
    }

    await prisma.message.update({
      where: { twilioMessageId: row.twilioMessageId },
      data: {
        status: fresh.status,
        errorCode: Number.isFinite(fresh.errorCode) ? fresh.errorCode : null,
        errorMessage: fresh.errorMessage,
      },
    });
    totalUpdated += 1;
  }

  if (totalUpdated >= limit) {
    console.log(`\nlimit ${limit} reached`);
    break;
  }
}

console.log('\n=== summary ===');
console.log(`mode: ${dryRun ? 'DRY RUN' : 'WRITE'}`);
console.log(`twilio sids fetched: ${totalSidsFetched}`);
console.log(`db rows scanned: ${totalScanned}`);
console.log(`rows ${dryRun ? 'would update' : 'updated'}: ${totalUpdated}`);
console.log('by status bucket:', updateBuckets);

await prisma.$disconnect();
