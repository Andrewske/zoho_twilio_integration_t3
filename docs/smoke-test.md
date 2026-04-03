# SMS Project — End-to-End Smoke Test

Run this after every deployment to verify the full message pipeline works correctly.

## Prerequisites

- Access to a real Twilio number assigned to a studio
- A known contact in Zoho CRM with a valid mobile number
- `CRON_SECRET` from `.env`
- Production URL (or staging)

---

## 1. DB & Migration Check

```bash
npx prisma migrate status
```

Expected: `All migrations applied. No pending migrations.`

Verify the new schema is live:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Message' AND column_name = 'retryCount';

SELECT table_name FROM information_schema.tables
WHERE table_name = 'CronRun';
```

Expected: both return a result.

---

## 2. Health Endpoint

```bash
curl https://<your-domain>/api/health/sms
```

Expected response:
```json
{
  "status": "healthy",
  "orphanedMessages": 0,
  "lastCronRun": { "startedAt": "...", "completedAt": "..." }
}
```

Note: On first deploy the `CronRun` table will be empty — status will show `unhealthy` until the first cron fires. That's expected.

---

## 3. Webhook — Inbound SMS Save

Send a real SMS to a studio number from a test phone (or use Twilio's "Send a Message" in the console).

**Verify in DB:**
```sql
SELECT id, "fromNumber", "toNumber", "studioId", "retryCount", "createdAt"
FROM "Message"
ORDER BY "createdAt" DESC
LIMIT 1;
```

Expected:
- Row exists with correct `fromNumber` and `toNumber`
- `studioId` is `NULL` (webhook no longer resolves this)
- `retryCount` is `0`

---

## 4. Cron — Manual Trigger

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron
```

Expected response:
```json
{
  "ok": true,
  "cronRunId": "...",
  "found": 1,
  "processed": 1,
  "tasksCreated": 1,
  "tasksLinked": 0,
  "errors": 0
}
```

**Verify the message was processed:**
```sql
SELECT id, "studioId", "contactId", "retryCount"
FROM "Message"
ORDER BY "createdAt" DESC
LIMIT 1;
```

Expected: `studioId` and `contactId` are now populated, `retryCount` is `1`.

**Verify a CronRun record was created:**
```sql
SELECT * FROM "CronRun" ORDER BY "startedAt" DESC LIMIT 1;
```

Expected: `completedAt` is set, `messagesFound = 1`, `tasksCreated = 1`, `errors = 0`.

**Verify a Zoho task was created in the CRM:**
- Check Zoho CRM for the contact — a new task should appear.

---

## 5. Yes Reply — Follow-up Flow

Send `yes` (or `yeah`, `sure`, `absolutely`) from a number that has a known Zoho contact.

Trigger cron manually (step 4).

Expected:
- A follow-up SMS is received on the test phone
- No duplicate follow-up if cron runs again (idempotency check — run cron a second time and verify only one follow-up was sent)

---

## 6. STOP Message — Inline Opt-Out

Send `stop` from any number.

**Verify immediately (no cron needed):**
- The webhook handles STOP inline
- Check Zoho CRM: contact's SMS opt-out field should be updated

---

## 7. Retry Behavior

Manually insert a message with an unrecognized `toNumber`:

```sql
INSERT INTO "Message" ("id", "fromNumber", "toNumber", "message", "twilioMessageId", "isWelcomeMessage", "isFollowUpMessage", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, '+10000000000', '+19999999999', 'test', 'SM_test_' || gen_random_uuid()::text, false, false, NOW(), NOW());
```

Run cron. Verify:
- `retryCount` increments to `1`
- No task created
- Run cron again → `retryCount` = `2`

---

## 8. Health Endpoint — Degraded State

With the orphaned message from step 7 still in the DB, hit the health endpoint again.

Expected: `status: "degraded"` with `orphanedMessages: 1`.

Clean up:
```sql
DELETE FROM "Message" WHERE "toNumber" = '+19999999999';
```

---

## 9. PostHog Events (post-deploy verification)

After running the above steps, check PostHog → ZohoTwilio project:

- `message_sent` — should show activity
- `CRON_ERROR` — should be 0 (all good)
- `CONTACT_NOT_FOUND` — should be 0 (used a known contact)

---

## 10. Alert Sanity Check

All 5 alerts should be `Not firing`:

- Contact Not Found — any occurrence
- Retry Exhausted — any occurrence
- Cron errors — any occurrence
- Exceptions spike — >5/hour
- Messages sent — dropped to 0

Check at: https://us.posthog.com/project/130065/insights?tab=alerts

---

## Checklist Summary

| Step | What it tests |
|------|--------------|
| 1. Migration | Schema is current |
| 2. Health endpoint | Infra is live |
| 3. Webhook save | Inbound SMS persists correctly |
| 4. Cron trigger | Contact resolution, task creation, CronRun logging |
| 5. Yes reply | Follow-up sent, deduplication works |
| 6. STOP message | Inline opt-out fires immediately |
| 7. Retry behavior | retryCount increments, bad messages don't get stuck |
| 8. Health degraded | Health endpoint reflects real DB state |
| 9. PostHog events | Server-side events flowing |
| 10. Alerts | All clear, nothing spuriously firing |
