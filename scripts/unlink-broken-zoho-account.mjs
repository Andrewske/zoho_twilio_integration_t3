#!/usr/bin/env node
// Unlink the dead Zoho account from southlake_admin so the health-aware
// picker stops selecting it. Self-verifying: refuses to unlink if the
// account's refresh token actually still works.
//
// Background: commit 009a1aa linked Alex Dane's CEO-level Zoho account
// (cmoampor5...) to southlake_admin to enable cross-studio contact lookup
// for Fort Worth / Colleyville leads. But the pre-existing dead account
// (cmoalutae0...) was never unlinked. AccountManager.getAccountByPlatform
// picks the alphabetically-first by PK = the dead one, refresh fails,
// lookupContact returns null, override skipped, messages stay tagged Southlake.
//
// Once Steps 1-3 of the resilient-riddle plan ship, the picker becomes
// health-aware and will skip the dead account on its own. This script
// is the data fix that prevents the picker from even seeing it.
//
// Run: node --import tsx/esm --conditions=react-server scripts/unlink-broken-zoho-account.mjs
//
// The --conditions=react-server flag stubs the `server-only` package
// (which utils/prisma.js imports). Without it, Node throws on import.

import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}

const { prisma } = await import('../utils/prisma.js');

const STUDIO_ID = 'a30c07c7-bef5-481f-aa48-5b30a3a4b440'; // southlake_admin
const ACCOUNT_ID = 'cmoalutae00008hg60i12xxr3';           // dead Zoho account

const link = await prisma.studioAccount.findUnique({
  where: { studioId_accountId: { studioId: STUDIO_ID, accountId: ACCOUNT_ID } },
});
if (!link) {
  console.log(`Already unlinked: ${ACCOUNT_ID} from ${STUDIO_ID}.`);
  await prisma.$disconnect();
  process.exit(0);
}

const account = await prisma.account.findUnique({ where: { id: ACCOUNT_ID } });
if (!account) {
  console.error(`Account ${ACCOUNT_ID} does not exist (but link does — orphan).`);
  console.error('Removing orphan link.');
  await prisma.studioAccount.delete({
    where: { studioId_accountId: { studioId: STUDIO_ID, accountId: ACCOUNT_ID } },
  });
  await prisma.$disconnect();
  process.exit(0);
}

// Self-verify: confirm the dead account is actually dead before unlinking.
const params = new URLSearchParams({
  refresh_token: account.refreshToken,
  client_id: account.clientId,
  client_secret: account.clientSecret,
  grant_type: 'refresh_token',
});
const r = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params.toString()}`, {
  method: 'POST',
});
const body = await r.text();
let parsed = {};
try { parsed = JSON.parse(body); } catch { /* keep parsed = {} */ }

const looksDead = !r.ok || parsed?.error || !parsed?.access_token;

if (!looksDead) {
  console.error('REFUSING TO UNLINK.');
  console.error(`Account ${ACCOUNT_ID} refresh succeeded — not actually dead.`);
  console.error(`Status: ${r.status}, body: ${body.slice(0, 200)}`);
  console.error('Manual review required before this script can proceed.');
  await prisma.$disconnect();
  process.exit(1);
}

console.log(`Confirmed dead. Refresh status: ${r.status}, error: ${parsed?.error || '<none>'}`);
console.log(`Unlinking ${ACCOUNT_ID} from southlake_admin (${STUDIO_ID})...`);

await prisma.studioAccount.delete({
  where: { studioId_accountId: { studioId: STUDIO_ID, accountId: ACCOUNT_ID } },
});

// Mark the Account row itself as failed so anywhere else it's still
// referenced, the health-aware picker skips it too.
await prisma.account.update({
  where: { id: ACCOUNT_ID },
  data: {
    lastRefreshError: parsed?.error || `HTTP ${r.status}`,
    lastRefreshErrorAt: new Date(),
  },
});

console.log('Done. Account row preserved (TokenRefresh history may reference it).');
await prisma.$disconnect();
