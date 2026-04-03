# Follow-Up Message Flow: Issues Analysis

**Date:** January 20, 2026
**Reported by:** Stone Oak studio
**Issue:** Contacts replying "yes" to welcome messages sometimes don't receive the automatic follow-up message

---

## Executive Summary

When contacts reply "yes" to welcome messages, several failure modes can prevent them from receiving the automatic follow-up message. In some cases, no task is created either, resulting in completely lost leads that require manual intervention by studio staff.

---

## Current Message Flow

### Welcome Message Flow
1. Zoho workflow triggers `/api/zoho/send_welcome` when a new lead is created
2. System creates a Message record with `isWelcomeMessage: true`
3. Welcome message sent via Twilio
4. Message record updated with `twilioMessageId`

### Incoming "Yes" Reply Flow (`/api/twilio/webhook`)
```
1. Parse incoming Twilio request (to, from, msg, twilioMessageId)
2. Get studio from phone number
3. Lookup contact via Zoho API ← FAILURE POINT #1
   └── If contact not found → return 500, message NOT saved
4. Create message record (studioId and contactId are NULL at this point)
5. Check if admin number, override studio if needed
6. If isYesMessage AND !hasReceivedFollowUpMessage:
   └── Call sendFollowUp() and return 200 ← Message never gets studioId/contactId updated
7. If isStopMessage: handle opt-out
8. Otherwise: create task, then update message with studioId/contactId
```

### sendFollowUp Flow (`/actions/zoho/sendFollowUp`)
```
1. findOrCreateMessage()
   ├── If existing unsent follow-up exists → return it
   ├── If no contact → create placeholder for cron, return NULL ← FAILURE POINT #2
   ├── If contactIsLead (isLead && Lead_Status == "New") → create message, return it
   └── Otherwise → return undefined ← FAILURE POINT #3
2. If message is null/undefined → return early (NO TASK CREATED)
3. Create task in Zoho
4. Send follow-up message via Twilio
5. Update contact status to "Contacted - Not Booked" (except Southlake)
```

### Cron Job Backup (`/app/api/cron/route.js`)
- Runs periodically to find unsent follow-up messages
- Looks for messages where `isFollowUpMessage: true` AND `twilioMessageId: null`
- Only looks at messages from the **last 1 hour**
- Re-attempts contact lookup and sendFollowUp
- **Issue:** May not be running reliably or frequently enough

---

## Identified Issues

### Issue #1: Contact Lookup Failure Loses Message Entirely (CRITICAL)

**Location:** `app/api/twilio/webhook/route.js:39-44`

```javascript
if (!contact) {
  // if (isYesMessage(msg)) {
  //   sendFollowUp({ to: from, from: to });  // COMMENTED OUT
  // }
  return new Response('contact not found', { status: 500, headers: { 'Retry-After': '60' } });
}
```

**Problem:** When Zoho API can't find the contact (e.g., contact added very recently), the webhook returns 500 BEFORE saving the message. The message is completely lost.

**Impact:** No record in database, no follow-up, no task, no way to recover.

---

### Issue #2: Yes Messages Never Get studioId/contactId Updated (HIGH)

**Location:** `app/api/twilio/webhook/route.js:47-76`

```javascript
// Line 47: Message created with NO studioId/contactId
const messageId = await createMessage({ body, studio });

// Lines 57-60: If yes message, return early
if (isYesMessage(msg) && !(await hasReceivedFollowUpMessage(contact))) {
  await sendFollowUp({ contact, studio, to: from, from: to, msg });
  return new Response(null, { status: 200 });  // ← Returns here!
}

// Line 76: This only runs for non-yes messages
await updateMessage({ messageId, studio, contact });
```

**Problem:** All incoming "yes" messages have `studioId: null` and `contactId: null` in the database.

**Impact:** Hard to track which studio a yes reply belongs to, difficult to query/report on.

---

### Issue #3: sendFollowUp Silent Exit Without Task (HIGH)

**Location:** `actions/zoho/sendFollowUp/index.js:103-147`

When `findOrCreateMessage()` returns null/undefined, the function exits early at line 27 without creating a task.

**Scenarios that cause this:**
- No contact found (creates placeholder, returns null)
- Contact exists but is NOT a lead
- Contact is lead but `Lead_Status != "New"`

**Problem:** No follow-up sent AND no task created = completely lost lead.

---

### Issue #4: Lead Status Gate (MEDIUM)

**Location:** `actions/zoho/sendFollowUp/index.js:95-100`

```javascript
const contactIsLead = (contact) => {
  return contact?.isLead && contact?.Lead_Status == 'New';
}
```

**Problem:** If studio changed status to "Attempted Contact - Not Reached" before the customer replied:
- Follow-up NOT sent (expected behavior)
- Task NOT created (unexpected - this is a bug)

**Expected:** Follow-up should not be sent, but a task SHOULD be created.

---

### Issue #5: Silent Error Handling (MEDIUM)

**Location:** `app/api/twilio/webhook/route.js:92-101`

```javascript
} catch (error) {
  console.error(error);
  logError({ ... });
}
return new Response(null, { status: 200 });  // Always returns 200!
```

**Problem:** Even when errors occur, webhook returns 200. Twilio doesn't retry.

---

## Affected Contacts (Last Month)

### Confirmed Cases

| Studio | Phone | Zoho ID | Welcome | Yes Reply | Delay | Issue |
|--------|-------|---------|---------|-----------|-------|-------|
| **Stone Oak** | 7262203347 (Mark) | 5114699000156132006 | Jan 16 03:33 | Not in DB | ~14 min | #1 - Lookup failed, message lost |
| **Champions** | 8324041104 | 5114699000156070003 | Jan 15 20:27:01 | Jan 15 20:27:54 | 53 sec | #3 - Message saved, no follow-up |
| **Design District** | 8324532648 | 5114699000155526001 | Jan 13 12:23 | Jan 13 12:31 | 8 min | #3 - Message saved, no follow-up |
| **Southlake** | 5127369845 | - | Jan 02 04:13 | Jan 13 20:39 | 11 days | #4 - Status changed before reply |

### Database Evidence

**Mark (Stone Oak) - Message completely lost:**
```sql
-- Only 2 messages exist for this contact (welcome + manual reply)
-- The "yes" reply is NOT in the database at all
SELECT * FROM "Message" WHERE "toNumber" = '7262203347' OR "fromNumber" = '7262203347';
-- Results: Welcome message + manual agent reply, NO "yes" message
```

**Champions & Design District - Message saved but no follow-up:**
```sql
-- Yes messages have NULL studioId and contactId
SELECT id, "fromNumber", "studioId", "contactId", message
FROM "Message"
WHERE id IN ('cmkfwit8l0008sghm3yw83r71', 'cmkckmgx2000611sffndmtk4r');

-- Results:
-- cmkfwit8l0008sghm3yw83r71: studioId=NULL, contactId=NULL, message='Yes'
-- cmkckmgx2000611sffndmtk4r: studioId=NULL, contactId=NULL, message='Yes'
```

**No tasks created for these contacts:**
```sql
SELECT * FROM "ZohoTask"
WHERE "contactId" IN ('5114699000156070003', '5114699000155526001');
-- Results: Empty
```

---

## SQL Queries for Finding Affected Contacts

### Find "Yes" Replies Without Follow-Up
```sql
WITH welcome_messages AS (
    SELECT
        m."toNumber" as customer_phone,
        m."studioId",
        m.created_at as welcome_date,
        s.name as studio_name
    FROM "Message" m
    JOIN "Studio" s ON m."studioId" = s.id
    WHERE
        m."isWelcomeMessage" = true
        AND m.created_at > NOW() - INTERVAL '1 month'
),
first_reply AS (
    SELECT DISTINCT ON (w.customer_phone)
        w.customer_phone,
        w.studio_name,
        w.welcome_date,
        m.message as first_reply_msg,
        m.created_at as reply_date,
        m."contactId"
    FROM welcome_messages w
    JOIN "Message" m ON m."fromNumber" = w.customer_phone
        AND m."toNumber" IN ('3466161442', '4697185726')
        AND m.created_at > w.welcome_date
    ORDER BY w.customer_phone, m.created_at ASC
),
followups AS (
    SELECT
        m."toNumber" as customer_phone,
        MIN(m.created_at) as followup_date
    FROM "Message" m
    WHERE
        m."isFollowUpMessage" = true
        AND m.created_at > NOW() - INTERVAL '1 month'
    GROUP BY m."toNumber"
)
SELECT
    fr.studio_name as studio,
    fr.customer_phone as phone,
    fr."contactId" as zoho_id,
    fr.first_reply_msg as reply,
    TO_CHAR(fr.welcome_date, 'MM-DD HH24:MI') as welcome_sent,
    TO_CHAR(fr.reply_date, 'MM-DD HH24:MI') as yes_received,
    ROUND(EXTRACT(EPOCH FROM (fr.reply_date - fr.welcome_date))/60) as mins_after_welcome
FROM first_reply fr
LEFT JOIN followups f ON fr.customer_phone = f.customer_phone
WHERE
    LOWER(TRIM(fr.first_reply_msg)) IN ('yes', 'yes!', 'yes.', 'yes please', 'yes please ', 'yes ')
    AND f.customer_phone IS NULL
ORDER BY fr.reply_date DESC;
```

### Find Yes Messages with NULL studioId
```sql
SELECT
    m.id,
    m."fromNumber" as customer_phone,
    m.message,
    m."studioId",
    m."contactId",
    m.created_at
FROM "Message" m
WHERE
    m."toNumber" IN ('3466161442', '4697185726')
    AND LOWER(TRIM(m.message)) LIKE '%yes%'
    AND m."studioId" IS NULL
    AND m.created_at > NOW() - INTERVAL '1 month'
ORDER BY m.created_at DESC;
```

---

## Key Files

| File | Purpose |
|------|---------|
| `app/api/twilio/webhook/route.js` | Handles incoming SMS messages from Twilio |
| `actions/zoho/sendFollowUp/index.js` | Sends follow-up message and creates task |
| `actions/zoho/contact/lookupContact/index.js` | Looks up contact in Zoho CRM |
| `actions/zoho/tasks/index.js` | Creates tasks in Zoho CRM |
| `app/api/cron/route.js` | Backup job to retry unsent follow-ups (1 hour window) |
| `app/api/zoho/send_welcome/route.js` | Sends initial welcome message |

---

## Studio Phone Numbers

| Studio | Twilio Phone | Notes |
|--------|--------------|-------|
| philip_admin | 3466161442 | Shared number for most studios |
| Southlake | 4697185726 | Has own number |
| All others | Use 3466161442 | Via philip_admin |

---

## Recommended Fixes (To Be Implemented)

1. **Save message BEFORE contact lookup** - Ensures we never lose incoming messages
2. **Update studioId/contactId for yes messages** - Move updateMessage before early return
3. **Create task when follow-up not sent** - Alert studio for manual follow-up
4. **Better backup mechanism** - Improve/fix the cron job or implement retry queue
5. **Better error handling** - Return 500 for transient errors to allow Twilio retry

---

## Notes

- The cron job at `/app/api/cron/route.js` was intended as a backup but "wasn't working" per user
- The cron only looks back 1 hour, which may not be enough for some edge cases
- All yes messages currently have NULL studioId/contactId due to early return in webhook
- Mark's case (Stone Oak) is the clearest example - his "yes" reply doesn't exist in the database at all
