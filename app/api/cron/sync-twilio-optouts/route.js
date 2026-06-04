import { NextResponse } from 'next/server';

import { flipOptOutIfStale } from '~/actions/zoho/contact/flipOptOutIfStale';
import { listOptOutBlockedMessages } from '~/actions/twilio/listOptOutBlockedMessages';
import { logError } from '~/utils/logError';
import { notify } from '~/utils/notify';
import { prisma } from '~/utils/prisma';

// Daily reverse-sync. Pulls phones Twilio considers opted-out (Error 21610)
// across the last 48h window and flips the matching Zoho Lead/Contact's
// SMS_Opt_Out to true. 48h covers single-day cadence with slack for any
// missed run. Idempotent: flipOptOutIfStale skips contacts already flagged.

export const maxDuration = 300;

const LOOKBACK_HOURS = 48;
const CONCURRENCY = 5;
const ERROR_RATE_ALERT = 0.2;

// Inline bounded-concurrency limiter. Each worker calls Zoho serially; with 5
// workers and ~400ms/call avg, effective rate ~750/min — under Enterprise
// tier's 25-concurrent cap. Limiter naturally spaces calls.
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

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sinceDate = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const stats = {
    sinceDate: sinceDate.toISOString(),
    distinctTwilioAccounts: 0,
    twilioHits: 0,
    distinctPhones: 0,
    scanned: 0,
    flipped: 0,
    already: 0,
    not_found: 0,
    lookup_error: 0,
    update_error: 0,
  };

  try {
    const twilioAccounts = await dedupedTwilioAccounts();
    stats.distinctTwilioAccounts = twilioAccounts.length;

    const distinct = new Set();
    for (const account of twilioAccounts) {
      try {
        const hits = await listOptOutBlockedMessages({ account, sinceDate });
        stats.twilioHits += hits.length;
        for (const h of hits) {
          if (h.to) distinct.add(h.to);
        }
      } catch (error) {
        logError({
          message: 'sync-twilio-optouts: twilio list failure',
          error,
          level: 'error',
          data: { accountId: account.id },
        });
      }
    }
    stats.distinctPhones = distinct.size;

    if (distinct.size === 0) {
      return NextResponse.json({ ok: true, ...stats });
    }

    const lookupStudio = await pickLookupStudio();
    if (!lookupStudio) {
      await notify({ type: 'OPTOUT_SYNC_NO_LOOKUP_STUDIO', data: {} });
      return NextResponse.json({ ok: false, reason: 'no_lookup_studio', ...stats }, { status: 500 });
    }

    const limit = createLimiter(CONCURRENCY);
    await Promise.all(
      [...distinct].map((phone) =>
        limit(async () => {
          const result = await flipOptOutIfStale({ phone, lookupStudioId: lookupStudio.id });
          stats.scanned += 1;
          stats[result.outcome] = (stats[result.outcome] || 0) + 1;
        }),
      ),
    );

    await maybeAlert(stats);
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    await logError({ message: 'sync-twilio-optouts: fatal', error, level: 'error' });
    await notify({ type: 'OPTOUT_SYNC_FATAL', data: { error: error.message } });
    return NextResponse.json({ ok: false, error: error.message, ...stats }, { status: 500 });
  }
}

// Dedup by Twilio Account SID (clientId). DB stores 3 rows but only 2 distinct
// SIDs because philip_admin is mapped under two studio rows.
async function dedupedTwilioAccounts() {
  const rows = await prisma.account.findMany({ where: { platform: 'twilio' } });
  const seen = new Set();
  const out = [];
  for (const a of rows) {
    if (seen.has(a.clientId)) continue;
    seen.add(a.clientId);
    out.push(a);
  }
  return out;
}

async function pickLookupStudio() {
  const studios = await prisma.studio.findMany({
    where: { active: true },
    select: { id: true, zohoId: true },
  });
  return studios.find((s) => s.zohoId) || null;
}

// Alert on silent failure modes:
//   * High error rate (Twilio API broke, Zoho creds rotated, etc.)
//   * Errors with zero flips (likely systemic, not per-record)
async function maybeAlert(stats) {
  const errors = stats.lookup_error + stats.update_error;
  if (stats.scanned === 0) return;
  const errorRate = errors / stats.scanned;
  if (errorRate > ERROR_RATE_ALERT) {
    await notify({
      type: 'OPTOUT_SYNC_HIGH_ERROR_RATE',
      data: { error_rate: errorRate.toFixed(2), errors, scanned: stats.scanned, flipped: stats.flipped },
    });
  } else if (stats.flipped === 0 && errors > 0) {
    await notify({
      type: 'OPTOUT_SYNC_ALL_ERRORS',
      data: { errors, scanned: stats.scanned },
    });
  }
}
