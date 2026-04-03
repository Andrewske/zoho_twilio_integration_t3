# Analyzer Module

## Files to Modify/Create
- `scripts/audit/analyzer.js` (new)

## Implementation Details

Build contact profiles by combining local data with Zoho timeline, then apply automation rules to determine verdicts.

### Functions Required

**1. `buildContactProfile(contactMessages, zohoTimeline)`**
Returns a structured profile:
```javascript
{
  phoneNumber: string,
  contactId: string,
  studioName: string,
  contactType: 'Lead' | 'Contact',  // Inferred from data
  messages: [{
    timestamp: Date,
    direction: 'in' | 'out',
    content: string,
    isWelcome: boolean,
    isFollowUp: boolean,
    linkedTaskId: string | null
  }],
  zohoEvents: [{
    timestamp: Date,
    event: string,
    source: 'crm_api' | 'crm_ui',
    details: string
  }],
  crossReference: {
    tasksMatchZoho: boolean,
    statusUpdatedViaApi: boolean,
    noConflictingManualEdits: boolean
  },
  verdict: 'PASS' | 'NEEDS REVIEW' | 'OK - NO ACTION EXPECTED'
}
```

**2. `applyAutomationRules(profile)`**
Apply rules based on database flags (not message content parsing):

| Condition | Expected Automation |
|-----------|---------------------|
| `isFollowUpMessage: true` exists for contact | "Yes" was detected → Follow-up sent + Task created |
| Task exists without follow-up message | Non-new lead path → Task created only |
| Inbound message, no task, no follow-up | Either opt-out OR failed automation |
| `isWelcomeMessage: true` only | Welcome sent, awaiting response |

**Note:** We infer "yes" detection from `isFollowUpMessage: true` rather than re-parsing message content. This ensures audit logic matches production behavior exactly.

**3. `determineVerdict(profile)`**
- `PASS` - All expected automations fired, confirmed in Zoho
- `NEEDS REVIEW` - Something missing or unexpected
- `OK - NO ACTION EXPECTED` - Messages that don't trigger automation

### Inference Logic
Since we're inferring lead status from local data:
- If `isFollowUpMessage: true` exists → Was a new lead at time of "yes"
- If task exists but no follow-up → Was non-new lead
- Check Zoho timeline for `Lead_Status` field changes to validate

### Known Limitation
If a Lead was converted to a Contact in Zoho between the message and the audit, the timeline will only show the Contact record's history. The original Lead timeline is not fetched. This may result in incomplete data for recently converted leads. Document this in the report output.

### Key Files to Reference
- `actions/zoho/sendFollowUp/index.js` - Follow-up logic patterns
- `actions/zoho/tasks/index.js` - Task creation patterns

## Acceptance Criteria
- [ ] Builds complete profile combining local + Zoho data
- [ ] Infers "yes" from `isFollowUpMessage: true` (not content parsing)
- [ ] Identifies automation path from database flags
- [ ] Cross-references local tasks with Zoho timeline
- [ ] Assigns appropriate verdict based on rules
- [ ] Handles missing Zoho timeline gracefully
- [ ] Documents Lead→Contact conversion limitation in output

## Dependencies
- Task 02 (database queries)
- Task 03 (Zoho timeline fetcher)
