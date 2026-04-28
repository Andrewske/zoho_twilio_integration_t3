#!/usr/bin/env node
// Rebackfill mis-routed inbound messages on a shared Twilio phone.
//
// For each from-number whose contact owner resolves to a different studio
// than the Message.studioId currently stored, this script:
//   1. Updates Message.studioId + contactId on every matching row in the window.
//   2. For each such Message that has NO ZohoTask AND is not a YES/STOP,
//      creates a ZohoTask under the correct studio.
//
// Existing wrong-studio ZohoTasks are NOT touched. They remain visible to
// whoever currently sees them (Lexi/Southlake). FW/Colleyville gain
// forward-looking visibility plus newly-created backfill tasks for messages
// that had nothing.
//
// DRY-RUN BY DEFAULT. The user must explicitly pass --execute to write,
// after taking a pg_dump backup of Message + ZohoTask tables.
//
// Usage:
//   node --import tsx/esm --conditions=react-server scripts/rebackfill-shared-phone-routing.mjs              # dry-run
//   node --import tsx/esm --conditions=react-server scripts/rebackfill-shared-phone-routing.mjs --execute    # writes
//   --phone <p>     default 4697185726
//   --days <n>      default 30
//   --json          machine-readable output
//
// The --conditions=react-server flag stubs the `server-only` package
// (which utils/prisma.js imports). Without it, Node throws on import.
//
// Pre-execute (manual):
//   mkdir -p backups
//   pg_dump --data-only -t '"Message"' -t '"ZohoTask"' "$DATABASE_URL" \
//     | gzip > backups/message-zohotask-$(date -u +%Y%m%dT%H%M%SZ).sql.gz

import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}

const args = parseArgs(process.argv.slice(2));
const SHARED_PHONE = args.phone || '4697185726';
const DAYS = Number(args.days || 30);
const EXECUTE = !!args.execute;

const { prisma } = await import('../utils/prisma.js');
const { isYesMessage, isStopMessage } = await import('../utils/messageHelpers.js');
const { createTaskData, postTaskToZoho } = await import('../actions/zoho/tasks/index.js');
const { getZohoAccount } = await import('../actions/zoho/index.js');

// Backfill posts tasks via the ADMIN account (Alex Dane) instead of each
// studio's own Zoho creds. Colleyville/FW/Southlake share a "Lexi" Zoho
// user whose profile lacks read permission on Colleyville/FW leads — the
// task POST gets INVALID_DATA on the lead id even though the lead exists.
// Admin account has cross-studio visibility. Owner is still set to the
// resolved studio's user id, so the task lands in the right inbox.
const ZOHO_API_DOMAIN = 'https://www.zohoapis.com';

console.error(`Mode: ${EXECUTE ? 'EXECUTE (writes!)' : 'DRY-RUN'}`);
console.error(`Phone: ${SHARED_PHONE}, lookback: ${DAYS}d\n`);

if (EXECUTE) {
  console.error('⚠ EXECUTE mode: this WILL mutate Message and create ZohoTask rows + Zoho API tasks.');
  console.error('⚠ Confirm you have a pg_dump backup of Message + ZohoTask before continuing.');
  console.error('⚠ Sleeping 5s — Ctrl-C to abort.\n');
  await new Promise(r => setTimeout(r, 5000));
}

// 1. Find admin studio + working zoho account for shared phone.
const adminStudio = await prisma.studio.findFirst({
  where: {
    isAdmin: true, active: true,
    OR: [{ twilioPhone: SHARED_PHONE }, { zohoVoicePhone: SHARED_PHONE }],
  },
});
if (!adminStudio) {
  console.error(`No admin studio attached to ${SHARED_PHONE}. Aborting.`);
  await prisma.$disconnect(); process.exit(1);
}

const adminAccount = await getZohoAccount({ studioId: adminStudio.id });
if (!adminAccount?.accessToken) {
  console.error('Admin zoho account unusable.'); await prisma.$disconnect(); process.exit(1);
}
console.error(`Admin studio: ${adminStudio.name} (${adminStudio.id})`);
console.error(`Using zoho account: ${adminAccount.id}\n`);

// 2. Build owner-id -> Studio map.
const studios = await prisma.studio.findMany({ select: { id: true, name: true, zohoId: true } });
const ownerToStudio = new Map(studios.map(s => [s.zohoId, s]));

// 3. Find distinct from-numbers in window with their currently-stored studio.
const distinctFromNumbers = await prisma.$queryRawUnsafe(`
  SELECT DISTINCT ON (m."fromNumber")
    m."fromNumber",
    m."studioId" AS "storedStudioId",
    s.name AS "storedStudio"
  FROM "Message" m
  LEFT JOIN "Studio" s ON s.id = m."studioId"
  WHERE m."toNumber" = $1
    AND m.created_at > NOW() - INTERVAL '${DAYS} days'
  ORDER BY m."fromNumber", m.created_at DESC
`, SHARED_PHONE);

console.error(`Distinct inbound from-numbers in window: ${distinctFromNumbers.length}\n`);

// 4. For each, look up contact via admin account.
const summary = {
  driftCount: 0,
  messagesUpdated: 0,
  tasksCreated: 0,
  errors: 0,
  skippedNoContact: 0,
  skippedNoOwnerStudio: 0,
  skippedNoDrift: 0,
  perFromNumber: [],
};

for (const row of distinctFromNumbers) {
  const result = await processFromNumber(row);
  summary.perFromNumber.push(result);
  if (result.error) summary.errors++;
  if (result.skipped === 'no-contact') summary.skippedNoContact++;
  if (result.skipped === 'no-owner-studio') summary.skippedNoOwnerStudio++;
  if (result.skipped === 'no-drift') summary.skippedNoDrift++;
  if (result.drift) summary.driftCount++;
  // Count any updates/tasks regardless of drift flag — re-runs after a
  // partial first run see drift=false (studioId already updated) but may
  // still create tasks the first run failed on.
  summary.messagesUpdated += result.messagesUpdated || 0;
  summary.tasksCreated += result.tasksCreated || 0;
}

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printSummary(summary);
}

await prisma.$disconnect();

// ---

async function processFromNumber(row) {
  const out = {
    fromNumber: row.fromNumber,
    storedStudio: row.storedStudio,
    storedStudioId: row.storedStudioId,
    contactName: null,
    ownerName: null,
    resolvedStudio: null,
    resolvedStudioId: null,
    drift: false,
    messagesEligible: 0,
    messagesUpdated: 0,
    tasksCreated: 0,
    skipped: null,
    error: null,
  };

  let contact;
  try {
    contact = await zohoSearchByMobile(row.fromNumber, adminAccount.accessToken);
  } catch (e) {
    out.error = `lookup: ${e.message}`;
    if (!args.json) console.log(`  ERROR ${row.fromNumber} → ${out.error}`);
    return out;
  }

  if (!contact) { out.skipped = 'no-contact'; return out; }
  out.contactName = contact.Full_Name || null;
  out.ownerName = contact.Owner?.name || null;
  const ownerId = contact.Owner?.id;
  if (!ownerId) { out.skipped = 'no-owner'; return out; }

  const ownedStudio = ownerToStudio.get(ownerId);
  if (!ownedStudio) {
    out.skipped = 'no-owner-studio';
    if (!args.json) console.log(`  SKIP  ${row.fromNumber}  ${out.contactName}  owner=${out.ownerName}  → no Studio mapped to ownerId ${ownerId}`);
    return out;
  }
  out.resolvedStudio = ownedStudio.name;
  out.resolvedStudioId = ownedStudio.id;

  // No-drift case is handled below: if studioId is already correct AND no
  // task-less messages remain, we'll skip via the empty `updatable` check.
  // Drift-vs-no-drift is treated as "needs attention" if any updatable rows
  // exist regardless of current studio attribution.
  out.drift = ownedStudio.id !== row.storedStudioId;

  // Find all in-window messages from this number that either:
  //   (a) are still tagged with the wrong stored studio (need updating), OR
  //   (b) are already tagged with the resolved studio but have no task yet
  //       (left over from a previous backfill run that updated studioId
  //        but failed task creation — re-attempt here).
  // Skip messages whose ZohoTask already points elsewhere — someone may
  // have re-blessed them in the UI; don't double-task.
  const eligible = await prisma.$queryRawUnsafe(`
    SELECT m.id, m.message, m."contactId", m."studioId",
      (SELECT COUNT(*)::int FROM "ZohoTask" t WHERE t."messageId" = m.id) AS task_count,
      (SELECT MAX(t."studioId") FROM "ZohoTask" t WHERE t."messageId" = m.id) AS task_studio
    FROM "Message" m
    WHERE m."toNumber" = $1
      AND m."fromNumber" = $2
      AND m.created_at > NOW() - INTERVAL '${DAYS} days'
      AND m."studioId" IN ($3, $4)
  `, SHARED_PHONE, row.fromNumber, row.storedStudioId, ownedStudio.id);

  // Updatable = no task yet, OR existing task still points at the
  // wrong stored studio. Already-correct tasks are left alone.
  const updatable = eligible.filter(m =>
    m.task_count === 0
    || m.task_studio === row.storedStudioId
  );
  out.messagesEligible = updatable.length;

  if (updatable.length === 0) {
    out.skipped = 'no-drift';
    return out;
  }

  const wouldCreateCount = updatable.filter(m =>
    m.task_count === 0 && !isYesMessage(m.message) && !isStopMessage(m.message)
  ).length;

  if (!args.json) {
    const label = out.drift ? 'DRIFT  ' : 'BACKFILL';
    console.log(
      `  ${label} ${row.fromNumber}  ${out.contactName}  ` +
      `owner=${out.ownerName}  ${row.storedStudio} → ${ownedStudio.name}  ` +
      `(${updatable.length} msg, ${wouldCreateCount} new task${wouldCreateCount === 1 ? '' : 's'})`
    );
  }

  if (!EXECUTE) {
    // Dry-run: just count what would happen.
    out.messagesUpdated = updatable.length;
    out.tasksCreated = wouldCreateCount;
    return out;
  }

  // Execute: per-from-number transaction. Inside the txn we ONLY do DB writes;
  // Zoho API calls happen between txns (they can't be transactional anyway).
  try {
    const ids = updatable.map(m => m.id);
    await prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { id: { in: ids } },
        data: { studioId: ownedStudio.id, contactId: contact.id },
      });
    });
    out.messagesUpdated = ids.length;

    // Create missing tasks. POST via ADMIN account (Alex Dane) — the
    // studio's own creds may lack visibility on the lead even though the
    // task is OWNED BY the studio's Zoho user. Owner field tells Zoho who
    // gets the task; the API auth just needs read+create permission.
    for (const m of updatable) {
      if (m.task_count > 0) continue;
      if (isYesMessage(m.message) || isStopMessage(m.message)) continue;
      try {
        const taskData = await createTaskData({
          zohoId: ownedStudio.zohoId,
          message: { to: SHARED_PHONE, from: row.fromNumber, msg: m.message },
          contact,
        });
        const zohoResp = await postTaskToZoho({
          apiDomain: ZOHO_API_DOMAIN,
          accessToken: adminAccount.accessToken,
          taskData,
        });
        const zohoTaskId = zohoResp?.details?.id;
        if (zohoTaskId) {
          await prisma.zohoTask.create({
            data: {
              zohoTaskId,
              messageId: m.id,
              studioId: ownedStudio.id,
              contactId: contact.id,
              taskSubject: taskData.Subject,
              taskStatus: taskData.Status,
            },
          });
          out.tasksCreated++;
        } else {
          out.error = `${out.error ? out.error + '; ' : ''}createTask msg=${m.id}: no task id returned`;
        }
      } catch (taskErr) {
        out.error = `${out.error ? out.error + '; ' : ''}createTask msg=${m.id}: ${taskErr.message}`;
      }
    }
  } catch (txErr) {
    out.error = `tx: ${txErr.message}`;
  }

  return out;
}

async function zohoSearchByMobile(mobile, accessToken) {
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
    if (r.status === 204) continue;
    if (!r.ok) throw new Error(`Zoho ${zohoModule} search ${r.status}`);
    const body = await r.json();
    const hit = body?.data?.[0];
    if (hit) return { ...hit, isLead: zohoModule === 'Leads' };
  }
  return null;
}


function printSummary(s) {
  console.log('\n--- summary ---');
  console.log(`  drift detected:          ${s.driftCount}`);
  console.log(`  messages ${EXECUTE ? 'updated' : 'would-update'}:  ${s.messagesUpdated}`);
  console.log(`  tasks ${EXECUTE ? 'created' : 'would-create'}:     ${s.tasksCreated}`);
  console.log(`  skipped (no contact):    ${s.skippedNoContact}`);
  console.log(`  skipped (no studio map): ${s.skippedNoOwnerStudio}`);
  console.log(`  skipped (no drift):      ${s.skippedNoDrift}`);
  console.log(`  errors:                  ${s.errors}`);
  if (!EXECUTE) console.log('\n  (dry-run — no DB or Zoho writes performed)');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--execute') out.execute = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}
