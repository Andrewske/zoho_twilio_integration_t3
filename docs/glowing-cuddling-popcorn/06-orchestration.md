# Orchestration

## Files to Modify/Create
- `scripts/audit/index.js` (new)

## Implementation Details

Wire all modules together into a cohesive audit flow.

### Main Function

**`runAudit(options)`**
```javascript
const ZOHO_API_DELAY = 2000; // Match pattern from fetch-shared-zoho-tasks.js

async function runAudit({ fromDate, toDate, studioFilter, verbose }) {
  // 1. Query local database
  console.log('Fetching messages from database...')
  const messages = await getMessagesInDateRange(fromDate, toDate, studioFilter)
  const tasks = await getTasksInDateRange(fromDate, toDate, studioFilter)
  const groupedMessages = groupMessagesByContact(messages)

  // 2. Determine token groups (Southlake separate, all others shared)
  const southlakeStudioId = await getSouthlakeStudioId() // or hardcode if known
  const sharedCredentialsStudioId = 'b2395e84-3a4b-4792-a67b-57ddb8d7e744' // philip_admin

  // 3. Build profiles with Zoho timeline
  console.log(`Processing ${Object.keys(groupedMessages).length} contacts...`)
  const profiles = []
  let processedCount = 0

  for (const [phone, contactMessages] of Object.entries(groupedMessages)) {
    processedCount++
    if (processedCount % 10 === 0) {
      console.log(`  Progress: ${processedCount}/${Object.keys(groupedMessages).length}`)
    }

    // Determine which credentials to use
    const isSouthlake = contactMessages[0].Studio?.name === 'Southlake'
    const studioIdForToken = isSouthlake ? southlakeStudioId : sharedCredentialsStudioId

    // Fetch Zoho timeline via lookupContact (handle failures gracefully)
    let zohoData = { contact: null, timeline: [] }
    try {
      zohoData = await lookupAndFetchTimeline(phone, studioIdForToken, verbose)
      // Rate limiting: wait between API calls
      await new Promise(resolve => setTimeout(resolve, ZOHO_API_DELAY))
    } catch (err) {
      if (err.status === 429) {
        console.log('Rate limit hit (429), waiting 60 seconds...')
        await new Promise(resolve => setTimeout(resolve, 60000))
        // Retry once
        try {
          zohoData = await lookupAndFetchTimeline(phone, studioIdForToken, verbose)
        } catch (retryErr) {
          console.warn(`Failed to fetch timeline for ${phone} after retry: ${retryErr.message}`)
        }
      } else {
        console.warn(`Failed to fetch timeline for ${phone}: ${err.message}`)
      }
    }

    // Correlate tasks with this contact
    const contactTasks = tasks.filter(t =>
      t.contactId === zohoData.contact?.id ||
      contactMessages.some(m => m.id === t.messageId)
    )

    const profile = buildContactProfile(contactMessages, zohoData, contactTasks)
    profiles.push(profile)
  }

  // 4. Generate reports
  console.log('Generating reports...')
  const dateRange = { from: fromDate, to: toDate }
  await generateMarkdownReport(profiles, dateRange)
  await generateJsonReport(profiles, dateRange)

  // 5. Print summary
  const issues = profiles.filter(p => p.verdict === 'NEEDS REVIEW')
  console.log(`\nAudit complete:`)
  console.log(`- ${profiles.length} contacts processed`)
  console.log(`- ${issues.length} issues found`)
  console.log(`- Reports saved to audit-reports/`)
}
```

### Error Handling Strategy
- Database errors: Fatal, abort with clear message
- Zoho API errors: Non-fatal per contact, log warning and continue
- File write errors: Fatal, abort with clear message
- Individual profile errors: Log and skip, don't crash entire audit

### Progress Logging
- Log count of contacts being processed
- Log progress every 10 contacts for large audits
- Log any warnings (Zoho API failures, etc.)
- Final summary with counts and file locations

### OAuth Token Management
- Two token groups: Southlake (separate account) vs all other studios (shared)
- Use `getZohoAccount({ studioId })` which handles refresh automatically
- For non-Southlake, use shared credentials (`philip_admin` studio ID)
- Tokens are fetched lazily per-contact based on studio name check
- Reference: `scripts/fetch-shared-zoho-tasks.js` for shared credentials pattern

## Acceptance Criteria
- [ ] Complete audit flow runs end-to-end
- [ ] Progress logged to console during execution
- [ ] Zoho API failures don't crash entire audit
- [ ] Both output files generated successfully
- [ ] Summary printed at end with actionable info
- [ ] Exit code 0 on success, non-zero on fatal error

## Dependencies
- Task 01 (CLI entry point calls this)
- Task 02 (database queries)
- Task 03 (Zoho timeline fetcher)
- Task 04 (analyzer module)
- Task 05 (formatters)

## Verification

After implementation, test with:
1. Run with `--from` set to a date range with known activity
2. Verify output files created in `audit-reports/`
3. Manually check 2-3 contacts in Zoho CRM to confirm accuracy
4. Test edge cases:
   - Contact with multiple messages
   - Contact who replied "yes"
   - Contact who replied "stop"
   - Contact with failed task creation (if any exist)
