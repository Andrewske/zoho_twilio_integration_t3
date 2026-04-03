# CLI Entry Point and Directory Structure

## Files to Modify/Create
- `scripts/audit-contacts.js` (new)
- `scripts/audit/` directory (new)
- `audit-reports/` directory (new)
- `.gitignore` (modify - add audit-reports/)

## Implementation Details

Create the CLI entry point with argument parsing for:
- `--from` - Start date (ISO format, default: 7 days ago)
- `--to` - End date (ISO format, default: today)
- `--studio` - Optional studio name filter
- `--verbose` - Enable detailed logging of API calls and decision logic

### CLI Usage
```bash
# Default: last 7 days
node scripts/audit-contacts.js

# Custom date range
node scripts/audit-contacts.js --from 2026-01-10 --to 2026-01-17

# Filter by studio
node scripts/audit-contacts.js --studio "Richmond"

# Verbose mode for debugging
node scripts/audit-contacts.js --verbose
```

### Directory Structure
```
scripts/
  audit-contacts.js              # CLI entry point, arg parsing
  audit/                         # Module directory (empty for now)

audit-reports/                   # Output directory (gitignored)
```

### Entry Point Structure
```javascript
// scripts/audit-contacts.js
// 1. Parse CLI arguments (process.argv or minimist)
// 2. Validate date inputs
// 3. Import and call audit orchestrator (from ./audit/index.js)
// 4. Handle errors and exit codes
```

## Acceptance Criteria
- [ ] Running `node scripts/audit-contacts.js --help` shows usage
- [ ] Date arguments parse correctly with sensible defaults
- [ ] Studio filter is optional
- [ ] `--verbose` flag enables detailed logging
- [ ] Invalid dates show clear error messages
- [ ] `audit-reports/` is in `.gitignore`

## Dependencies
None - this is the foundation task.
