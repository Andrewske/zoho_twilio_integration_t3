# Zoho Timeline Fetcher

## Files to Modify/Create
- `scripts/audit/zohoTimeline.js` (new)

## Implementation Details

Create functions to fetch timeline data from Zoho CRM API for leads and contacts.

### API Endpoint
```
GET /crm/v8/{Leads|Contacts}/{recordId}/__timeline
```

### Functions Required

**1. `lookupAndFetchTimeline(phoneNumber, studioId, verbose)`**
- Use existing `lookupContact({ mobile, studioId })` to get current Zoho record
- `lookupContact` already searches both Leads and Contacts modules and returns `isLead` flag
- Then call timeline API with the returned `contact.id` and `contact.isLead`
- Returns `{ contact, timeline }` or `{ contact: null, timeline: [], error }` on failure

**2. `fetchContactTimeline(contactId, isLead, accessToken, apiDomain)`**
- Call Zoho timeline API for the given record
- Use module based on `isLead` flag: `Leads` or `Contacts`
- Parse response to extract relevant events

**2. `parseTimelineEvents(apiResponse)`**
- Extract from each timeline entry:
  - `audited_time` - When the event occurred
  - `action` - What happened (added, updated)
  - `source` - Origin (crm_ui vs crm_api)
  - `field_history` - Field changes with old/new values
  - `record` - Related records (tasks, notes)

### Timeline Response Structure
```json
{
  "data": [
    {
      "done_by": { "name": "...", "id": "..." },
      "audited_time": "2023-06-07T10:30:00+05:30",
      "action": "updated",
      "source": "crm_api",
      "field_history": {
        "api_name": "Lead_Status",
        "_value": { "old_value": "New", "new_value": "Contacted" }
      },
      "record": {
        "module": { "api_name": "Tasks" },
        "name": "NEW SMS: From Lead - John",
        "id": "..."
      }
    }
  ]
}
```

### Key Events to Extract
- Lead_Status field changes (track status progression)
- Task creation events (verify our tasks appear)
- Source = `crm_api` confirms our automation
- Source = `crm_ui` indicates manual intervention

### OAuth Token Handling
- Two token groups: Southlake (separate account) vs all other studios (shared account)
- Use `getZohoAccount({ studioId })` which handles token refresh automatically
- For non-Southlake studios, can use shared credentials from any studio in the group
- Reference: `actions/zoho/contact/lookupContact/index.js`, `scripts/fetch-shared-zoho-tasks.js`

### Rate Limiting
- Copy pattern from `scripts/fetch-shared-zoho-tasks.js`:
  - `ZOHO_API_DELAY = 2000` (2 second delay between API calls)
  - Handle 429 responses: wait 60 seconds and retry
- Example:
```javascript
const ZOHO_API_DELAY = 2000;

// Between API calls:
await new Promise(resolve => setTimeout(resolve, ZOHO_API_DELAY));

// On 429 response:
if (response.status === 429) {
  console.log('Rate limit hit (429), waiting 60 seconds...');
  await new Promise(resolve => setTimeout(resolve, 60000));
  // retry
}
```

## Acceptance Criteria
- [ ] Uses `lookupContact` to resolve phone → Zoho record (handles Lead vs Contact automatically)
- [ ] Can fetch timeline for both Leads and Contacts
- [ ] Parses field history changes correctly
- [ ] Identifies task creation events
- [ ] Distinguishes crm_api vs crm_ui sources
- [ ] Handles API errors gracefully (returns empty timeline, not crash)
- [ ] Implements rate limiting (2s delay between calls, 60s wait on 429)
- [ ] Works with existing OAuth token infrastructure
- [ ] Handles Southlake separately from other studios (different Zoho account)

## Dependencies
- Task 01 (directory structure exists)
- Existing Zoho OAuth utilities in `actions/zoho/`
