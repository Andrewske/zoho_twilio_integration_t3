# AI Learnings - SMS Project

This file contains important learnings about the project structure and common patterns to help with future development.

## Zoho Analytics Push Still Failing in Production (2026-09-09 investigation)

### Facts established
- Production URL: `https://zoho-twilio-integration-t3.vercel.app` (found via Twilio number smsUrl, it is not written down anywhere in the repo)
- The nightly analytics cron `GET /api/twilio/get_messages` returns **500 in ~1.4s** in production. Every run since the June 4 fix (c3b5c7b) has likely failed, so the Zoho Analytics message log has no data after the June 4 backfill.
- Vercel cron scheduling itself works: `/api/cron` runs every 5 min (verified via `/api/health/sms`, which now requires `Authorization: Bearer CRON_SECRET` in production).
- Production `CRON_SECRET` matches local `.env` (manual trigger got 500 from inside the handler, not 401).
- The identical code path works locally against the same cloudclusters DB: `scripts/backfill-zoho-analytics.mjs --dry --since <date>` fetches messages and resolves the Zoho token fine.
- **Root cause (confirmed via live Vercel logs while re-triggering the cron):** `TypeError: Cannot read properties of undefined (reading 'list')` — `app/api/twilio/get_messages/route.js` called `getTwilioClient(twilioAccount)` without `await`. The Next 16 upgrade (2831768, 2026-04-02) made `getTwilioClient` async ('use server' exports), so `client` became a Promise and `client.messages` undefined. That upgrade broke the route TWICE: the FormData.getHeaders bug (fixed June 4 in c3b5c7b) and this missing await (not fixed until 2026-09-09). The backfill script always awaited, which is why backfills worked and masked the route bug.
- Fix: one-line `await` in the route (+ same fix in scripts/backfill-message-status.mjs:61). All 191 tests pass.
- Lesson: when a sync export becomes async in a refactor/upgrade, grep ALL call sites for non-awaited calls. Lesson 2: after "fixing" a cron, verify by manually triggering the PROD endpoint (`scripts/trigger-analytics-cron.mjs`), not by running a sibling script locally.
- The Zoho token from `getZohoAccount` has only `ZohoAnalytics.data.create` scope. You cannot read the view back via API to check the latest landed row (`INVALID_OAUTHSCOPE`).
- The ANALYTICS_IMPORT_OK absence alert referenced in commit 41f841d is not in the alert list in `docs/smoke-test.md`; verify it actually exists in PostHog, because no alert fired during 3 months of nightly failures.

### Useful probes (in scripts/)
- `trigger-analytics-cron.mjs` — manually fire the prod analytics cron, prints status + latency
- `check-prod-domain.mjs` — recover the prod domain from Twilio webhook config

## Zoho Voice Message Duplication Issue (Resolved)

### Problem
- Messages sent via Zoho Voice were creating multiple database records
- Root cause: Race condition between message creation and API sync
- Symptoms: 2-3 records for single message (one with null zohoMessageId, one with proper ID, sometimes empty message)

### Solution Implemented
1. **Enhanced Deduplication Logic** (`utils/messageDeduplication.js`)
   - Multi-criteria duplicate detection: zohoMessageId, content, phone numbers, timing (±5 min)
   - Centralized utility for consistent deduplication across codebase

2. **Atomic Message Updates** (`actions/messages/sendMessage.js`)
   - Improved logging for debugging
   - Better handling of zohoMessageId assignment

3. **Smart Sync Process** (`actions/zoho/voice/fetchAllMessages.js`)
   - Updates existing messages with missing zohoMessageId instead of creating duplicates
   - Uses enhanced deduplication before creating new records

4. **Cleanup Tools**
   - Script: `scripts/cleanup-duplicate-messages.js`
   - Commands: `pnpm cleanup:duplicates:dry` and `pnpm cleanup:duplicates`

### Key Files and Functions
- **Message Sending**: `actions/messages/sendMessage.js` → `sendViaZohoVoice()`
- **Message Syncing**: `actions/zoho/voice/fetchAllMessages.js` → `fetchAndSaveZohoVoiceMessages()`
- **Deduplication**: `utils/messageDeduplication.js` → `deduplicateZohoVoiceMessages()`
- **UI Message Loading**: `actions/messages/index.js` → `getMessages()`

### Prevention Strategy
- Always check for both zohoMessageId and content matches when syncing
- Use timing proximity checks for race condition scenarios
- Update existing records rather than creating new ones when possible