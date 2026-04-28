#!/usr/bin/env node
// Verify shared-phone routing fix (commit 009a1aa).
//
// For each from-number on a shared Twilio phone:
//   1. Look up contact via the admin studio's Zoho account
//      (broad-visibility CEO-level token).
//   2. Resolve contact.Owner.id -> Studio row in the local DB.
//   3. Compare with the studioId currently stored on the Message row.
//
// A "DRIFT" row means the cron's override path SHOULD have re-tagged
// the message to a different studio (e.g. Fort Worth / Colleyville)
// but the Message.studioId still points at the default phone-owner studio.
//
// This script does direct Zoho API calls (refresh token once, search
// /Leads then /Contacts) instead of going through the Next server-action
// stack — that lets it run cleanly under bare Node + tsx.
//
// Usage:
//   node --import tsx/esm --conditions=react-server scripts/verify-shared-phone-routing.mjs
//   node --import tsx/esm --conditions=react-server scripts/verify-shared-phone-routing.mjs --phone 4697185726 --days 30
//   node --import tsx/esm --conditions=react-server scripts/verify-shared-phone-routing.mjs --numbers 9407039565,8178467996
//   node --import tsx/esm --conditions=react-server scripts/verify-shared-phone-routing.mjs --json
//
// The --conditions=react-server flag stubs the `server-only` package
// (which utils/prisma.js imports). Without it, Node throws on import.
//
// Flags:
//   --phone <e164-or-10>   shared inbound phone (default 4697185726)
//   --days <n>             lookback window for inbound messages (default 14)
//   --numbers <csv>        explicit from-numbers, skip DB scan
//   --json                 raw JSON output

import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}

const args = parseArgs(process.argv.slice(2));
const SHARED_PHONE = args.phone || '4697185726';
const DAYS = Number(args.days || 14);

const { prisma } = await import('../utils/prisma.js');

const adminStudio = await prisma.studio.findFirst({
  where: { isAdmin: true, active: true,
    OR: [{ twilioPhone: SHARED_PHONE }, { zohoVoicePhone: SHARED_PHONE }] },
});
if (!adminStudio) {
  console.error(`No admin studio attached to phone ${SHARED_PHONE}. Aborting.`);
  await prisma.$disconnect();
  process.exit(1);
}

const adminAccounts = await prisma.studioAccount.findMany({
  where: { studioId: adminStudio.id, Account: { platform: 'zoho' } },
  include: { Account: true },
});
if (adminAccounts.length === 0) {
  console.error(`No Zoho account attached to admin studio ${adminStudio.name}. Aborting.`);
  await prisma.$disconnect();
  process.exit(1);
}
console.error(`Admin studio: ${adminStudio.name} (${adminStudio.id})`);
console.error(`Candidate Zoho accounts: ${adminAccounts.map(a => a.Account.id).join(', ')}`);

const accessToken = args.account
  ? await ensureFreshToken(adminAccounts.find(a => a.Account.id === args.account)?.Account
      ?? (() => { throw new Error(`account ${args.account} not attached to admin studio`); })())
  : await firstWorkingToken(adminAccounts.map(a => a.Account));
console.error('');

const ownerToStudio = await buildOwnerStudioMap();

const targets = await collectTargets({ args, sharedPhone: SHARED_PHONE, days: DAYS });
if (targets.length === 0) {
  console.error('No targets to verify.');
  await prisma.$disconnect();
  process.exit(0);
}
console.error(`Verifying ${targets.length} target(s)...\n`);

const results = [];
for (const t of targets) {
  const row = await verifyOne({ target: t, accessToken });
  results.push(row);
  if (!args.json) printRow(row);
}

if (args.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printSummary(results);
}

await prisma.$disconnect();

// ---

async function verifyOne({ target, accessToken }) {
  const row = {
    fromNumber: target.fromNumber,
    contactId: target.contactId || null,
    messageId: target.messageId || null,
    storedStudio: target.storedStudio || null,
    contactName: null,
    ownerName: null,
    ownerId: null,
    resolvedStudio: null,
    resolvedStudioId: null,
    drift: null,
    error: null,
  };

  let contact = null;
  try {
    contact = await zohoSearchByMobile({ mobile: target.fromNumber, accessToken });
  } catch (e) {
    row.error = `lookup threw: ${e.message}`;
    return row;
  }

  if (!contact) {
    row.error = 'contact not found in Leads or Contacts (admin token)';
    return row;
  }

  row.contactName = contact.Full_Name || null;
  row.ownerName = contact.Owner?.name || null;
  row.ownerId = contact.Owner?.id || null;

  if (!row.ownerId) {
    row.error = 'contact has no Owner.id';
    return row;
  }

  const owned = ownerToStudio.get(row.ownerId);
  if (owned) {
    row.resolvedStudio = owned.name;
    row.resolvedStudioId = owned.id;
  }

  if (row.storedStudio && row.resolvedStudio) {
    row.drift = row.storedStudio !== row.resolvedStudio;
  }

  return row;
}

async function zohoSearchByMobile({ mobile, accessToken }) {
  const normalized = String(mobile).replace(/\D/g, '').slice(-10);
  const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
  for (const zohoModule of ['Leads', 'Contacts']) {
    const url = `https://www.zohoapis.com/crm/v5/${zohoModule}/search`
      + `?fields=${fields}&criteria=(Mobile:equals:${normalized})`;
    const r = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      cache: 'no-cache',
    });
    if (r.status === 204) continue;          // no results
    if (!r.ok) throw new Error(`Zoho ${zohoModule} search ${r.status}`);
    const body = await r.json();
    const hit = body?.data?.[0];
    if (hit) return { ...hit, isLead: zohoModule === 'Leads' };
  }
  return null;
}

async function firstWorkingToken(accounts) {
  let lastErr = null;
  for (const a of accounts) {
    try {
      const t = await ensureFreshToken(a);
      console.error(`Using account ${a.id}`);
      return t;
    } catch (e) {
      console.error(`  account ${a.id} failed: ${e.message}`);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('no working zoho account');
}

async function ensureFreshToken(account) {
  const expired = isExpired(account);
  if (!expired && account.accessToken) {
    console.error(`Reusing cached access token for ${account.id} (not expired).`);
    return account.accessToken;
  }
  console.error(`Refreshing Zoho access token for ${account.id}...`);
  const params = new URLSearchParams({
    refresh_token: account.refreshToken,
    client_id: account.clientId,
    client_secret: account.clientSecret,
    grant_type: 'refresh_token',
  });
  const r = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params.toString()}`, { method: 'POST' });
  const body = await r.text();
  if (!r.ok) {
    console.error(`Refresh failed ${r.status}: ${body}`);
    throw new Error('refresh failed');
  }
  const data = JSON.parse(body);
  if (!data.access_token) {
    console.error(`Refresh body: ${body}`);
    throw new Error('no access_token in refresh response');
  }
  await prisma.account.update({
    where: { id: account.id },
    data: { accessToken: data.access_token, expiresIn: data.expires_in },
  });
  return data.access_token;
}

function isExpired(account) {
  if (!account?.updatedAt || !account?.expiresIn) return true;
  const exp = new Date(account.updatedAt).getTime() + account.expiresIn * 1000;
  return exp < Date.now();
}

async function buildOwnerStudioMap() {
  const studios = await prisma.studio.findMany({ select: { id: true, name: true, zohoId: true } });
  return new Map(studios.map(s => [s.zohoId, s]));
}

async function collectTargets({ args, sharedPhone, days }) {
  if (args.numbers) {
    return args.numbers.split(',').map(n => ({
      fromNumber: n.trim(),
      contactId: null,
      messageId: null,
      storedStudio: null,
    }));
  }

  // Default: scan recent distinct inbound from-numbers on the shared phone.
  const rows = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON (m."fromNumber")
      m.id AS "messageId",
      m."fromNumber",
      m."contactId",
      s.name AS "storedStudio"
    FROM "Message" m
    LEFT JOIN "Studio" s ON s.id = m."studioId"
    WHERE m."toNumber" = $1
      AND m.created_at > NOW() - INTERVAL '${days} days'
    ORDER BY m."fromNumber", m.created_at DESC
  `, sharedPhone);

  return rows.map(r => ({
    fromNumber: r.fromNumber,
    contactId: r.contactId,
    messageId: r.messageId,
    storedStudio: r.storedStudio,
  }));
}

function printRow(r) {
  if (r.error) {
    console.log(`  ${r.fromNumber || r.contactId} → ERROR: ${r.error}`);
    return;
  }
  const tag = r.drift === true ? '⚠ DRIFT'
            : r.drift === false ? 'OK    '
            : '       ';
  const resolved = r.resolvedStudio || `(no studio for ownerId ${r.ownerId})`;
  console.log(`  ${tag}  ${r.fromNumber}  ${r.contactName}  owner=${r.ownerName}  resolved=${resolved}  stored=${r.storedStudio}`);
}

function printSummary(results) {
  const total = results.length;
  const errors = results.filter(r => r.error).length;
  const drift = results.filter(r => r.drift === true).length;
  const ok = results.filter(r => r.drift === false).length;
  const unowned = results.filter(r => !r.error && !r.resolvedStudio).length;

  const byOwnerStudio = {};
  for (const r of results) {
    if (r.resolvedStudio) byOwnerStudio[r.resolvedStudio] = (byOwnerStudio[r.resolvedStudio] || 0) + 1;
  }

  console.log('\n--- summary ---');
  console.log(`  total:       ${total}`);
  console.log(`  ok:          ${ok}`);
  console.log(`  drift:       ${drift}    (override SHOULD have fired but stored studio differs)`);
  console.log(`  unowned:     ${unowned}  (contact owner is not mapped to any Studio.zohoId)`);
  console.log(`  errors:      ${errors}`);
  if (Object.keys(byOwnerStudio).length) {
    console.log('  by resolved studio:');
    for (const [name, cnt] of Object.entries(byOwnerStudio).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${name}: ${cnt}`);
    }
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a.startsWith('--')) { out[a.slice(2)] = argv[++i]; }
  }
  return out;
}
