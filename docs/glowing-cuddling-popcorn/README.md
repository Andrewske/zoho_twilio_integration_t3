# SMS Audit Script

## Overview

CLI script for periodic auditing of SMS automation. Compares local message/task data against Zoho CRM timeline to verify automations (follow-ups, task creation) are working correctly.

**Usage:**
```bash
node scripts/audit-contacts.js                              # Last 7 days
node scripts/audit-contacts.js --from 2026-01-10 --to 2026-01-17
node scripts/audit-contacts.js --studio "Richmond"
```

**Output:**
- `audit-reports/audit-YYYY-MM-DD.md` - Human-readable report
- `audit-reports/audit-YYYY-MM-DD.json` - Machine-readable data

## Task Sequence

1. [01-cli-entry-point.md](./01-cli-entry-point.md) - CLI argument parsing and directory setup
2. [02-database-queries.md](./02-database-queries.md) - Query messages and tasks from local database
3. [03-zoho-timeline-fetcher.md](./03-zoho-timeline-fetcher.md) - Fetch timeline data from Zoho CRM API
4. [04-analyzer-module.md](./04-analyzer-module.md) - Build profiles and apply automation rules
5. [05-formatters.md](./05-formatters.md) - Generate markdown and JSON reports
6. [06-orchestration.md](./06-orchestration.md) - Wire everything together

## Success Criteria

1. Run script with `--from` set to a date range with known activity
2. Verify output files created in `audit-reports/`
3. Manually check 2-3 contacts in Zoho CRM to confirm accuracy
4. Test edge cases:
   - Contact with multiple messages
   - Contact who replied "yes"
   - Contact who replied "stop"
   - Contact with failed task creation

## Execution Instructions

1. Execute tasks in numerical order (01 → 06)
2. Each task file contains:
   - Files to modify/create
   - Implementation details
   - Acceptance criteria
   - Dependencies
3. Verify acceptance criteria before moving to next task

## Known Limitations

1. **Lead→Contact conversions**: If a Lead was converted to a Contact in Zoho between the message and the audit, only the Contact's timeline is fetched. Historical Lead timeline data is not retrieved.

2. **Contact names**: Names are not stored locally. Reports display phone numbers; names may appear in Zoho timeline data when available.

## Dependencies

- Existing Prisma setup (`utils/prisma.js`)
- Existing Zoho OAuth infrastructure (`actions/zoho/`)
- Existing `lookupContact` function (`actions/zoho/contact/lookupContact/`)
- Node.js with access to project dependencies
