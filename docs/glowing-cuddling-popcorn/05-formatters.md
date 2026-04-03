# Formatters

## Files to Modify/Create
- `scripts/audit/formatters/markdown.js` (new)
- `scripts/audit/formatters/json.js` (new)

## Implementation Details

Generate output files from analyzed contact profiles.

### Markdown Formatter

**1. `generateMarkdownReport(profiles, dateRange)`**

Output structure:
```markdown
# SMS Audit Report: Jan 13-20, 2026

## Summary
- Contacts with activity: 47
- Automation success: 42 (89%)
- Issues found: 5

| Issue Type              | Count |
|-------------------------|-------|
| Missing follow-up       | 2     |
| Missing task            | 3     |

---
### 555-123-4567
**Studio:** Richmond | **Contact ID:** 12345678 | **Type:** Lead

> Note: Contact names are not stored locally. Names may appear in Zoho timeline data when available.

#### Message Timeline (Local)
| Time | Dir | Message | Auto? | Task? |
|------|-----|---------|-------|-------|
| Jan 14 3:00pm | → OUT | "Hi John! Thanks for..." | ✓ Welcome | — |
| Jan 15 10:23am | ← IN | "Yes I'm interested" | | ✓ Task #98765 |
| Jan 15 10:24am | → OUT | "Great! We have availability..." | ✓ Follow-up | — |

#### Zoho Timeline
| Time | Event | Source | Details |
|------|-------|--------|---------|
| Jan 14 2:55pm | Lead created | crm_ui | — |
| Jan 15 10:24am | Status changed | crm_api | New Lead → Contacted - Not Booked |
| Jan 15 10:24am | Task created | crm_api | "NEW SMS: From Lead - John Smith" |

#### Cross-Reference
- [x] Task #98765 exists in Zoho timeline
- [x] Status updated via API after "yes" message
- [x] No conflicting manual edits during message window

**Verdict:** PASS
---
```

### JSON Formatter

**2. `generateJsonReport(profiles, dateRange)`**

Output structure matching markdown content:
```json
{
  "dateRange": { "from": "2026-01-13", "to": "2026-01-20" },
  "summary": {
    "totalContacts": 47,
    "automationSuccess": 42,
    "successRate": 0.89,
    "issues": {
      "missingFollowUp": 2,
      "missingTask": 3
    }
  },
  "contacts": [
    {
      "phone": "555-123-4567",
      "studio": "Richmond",
      "contactId": "12345678",
      "type": "Lead",
      "messages": [...],
      "zohoTimeline": [...],
      "crossReference": {...},
      "verdict": "PASS"
    }
  ]
}
```

### File Output
- Write to `audit-reports/audit-YYYY-MM-DD-HHmmss.md`
- Write to `audit-reports/audit-YYYY-MM-DD-HHmmss.json`
- Timestamp in filename = report generation time (prevents overwrites on same-day reruns)

## Acceptance Criteria
- [ ] Markdown is human-readable and properly formatted
- [ ] Summary statistics are accurate
- [ ] Tables render correctly in markdown viewers
- [ ] JSON is valid and parseable
- [ ] JSON structure matches markdown content
- [ ] Files written to correct location with date-stamped names

## Dependencies
- Task 04 (analyzer module provides profiles)
