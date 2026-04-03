# Database Queries Module

## Files to Modify/Create
- `scripts/audit/queries.js` (new)

## Implementation Details

Create database query functions to retrieve messages and tasks for the audit period.

### Functions Required

**1. `getMessagesInDateRange(fromDate, toDate, studioName?)`**
- Query `Message` table filtered by `createdAt` within date range
- Optionally filter by studio name (join with Studio table)
- Include Studio relation to get `smsPhone`/`twilioPhone` for direction inference
- Return all relevant fields:
  - `id`, `fromNumber`, `toNumber`, `message`, `createdAt`
  - `isWelcomeMessage`, `isFollowUpMessage`
  - `studioId`, `contactId`
  - Studio: `smsPhone`, `twilioPhone`, `name`

**2. `getTasksInDateRange(fromDate, toDate, studioName?)`**
- Query `ZohoTask` table independently by `createdAt` within date range
- Include Studio relation for studio name
- Return: `id`, `zohoTaskId`, `messageId`, `studioId`, `contactId`, `taskSubject`, `taskStatus`, `createdAt`
- Note: `messageId` is nullable - not all tasks have linked messages

**3. `groupMessagesByContact(messages)`**
- Group messages by contact phone number (normalize phone format)
- Return map: `{ phoneNumber: Message[] }`

**4. `inferMessageDirection(message)`**
- Compare `fromNumber` against studio's `smsPhone` or `twilioPhone`
- If match → 'out' (outbound from studio)
- Otherwise → 'in' (inbound from customer)

### Key Files to Reference
- `utils/prisma.js` - Database client
- `prisma/schema.prisma` - Message and ZohoTask models

### Schema Reference
```prisma
model Message {
  id                String
  fromNumber        String
  toNumber          String
  studioId          String?
  contactId         String?
  message           String?
  isWelcomeMessage  Boolean @default(false)
  isFollowUpMessage Boolean @default(false)
  createdAt         DateTime
  ZohoTask          ZohoTask[]
}

model ZohoTask {
  id          String
  zohoTaskId  String @unique
  messageId   String?
  studioId    String
  contactId   String?
  taskSubject String?
  taskStatus  String?
}
```

## Acceptance Criteria
- [ ] Query returns messages within specified date range
- [ ] Query returns tasks within specified date range (independent query)
- [ ] Studio filter works when provided
- [ ] Studio relation included for direction inference
- [ ] Messages can be grouped by contact phone number
- [ ] Message direction correctly inferred from studio phone comparison
- [ ] Empty results handled gracefully

## Dependencies
- Task 01 (directory structure exists)
