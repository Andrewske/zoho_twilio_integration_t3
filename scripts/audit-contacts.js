#!/usr/bin/env node

/**
 * SMS Audit Script
 * Compares local message/task data against Zoho CRM timeline to verify automations
 *
 * Usage:
 *   node scripts/audit-contacts.js                              # Last 7 days
 *   node scripts/audit-contacts.js --from 2026-01-10 --to 2026-01-17
 *   node scripts/audit-contacts.js --studio "Richmond"
 *   node scripts/audit-contacts.js --verbose
 *   node scripts/audit-contacts.js --help
 */

import { runAudit } from './audit/index.js';

const parseArgs = (args) => {
  const options = {
    fromDate: null,
    toDate: null,
    studioFilter: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--from':
        options.fromDate = args[++i];
        break;
      case '--to':
        options.toDate = args[++i];
        break;
      case '--studio':
        options.studioFilter = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
};

const validateDate = (dateStr, label) => {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.error(`Error: Invalid ${label} date format: "${dateStr}"`);
    console.error('Expected format: YYYY-MM-DD (e.g., 2026-01-15)');
    process.exit(1);
  }
  return date;
};

const showHelp = () => {
  console.log(`
SMS Audit Script - Verify SMS automation against Zoho CRM

Usage:
  node scripts/audit-contacts.js [options]

Options:
  --from <date>     Start date (YYYY-MM-DD format, default: 7 days ago)
  --to <date>       End date (YYYY-MM-DD format, default: today)
  --studio <name>   Filter by studio name (optional)
  --verbose, -v     Enable detailed logging of API calls and decision logic
  --help, -h        Show this help message

Examples:
  node scripts/audit-contacts.js
  node scripts/audit-contacts.js --from 2026-01-10 --to 2026-01-17
  node scripts/audit-contacts.js --studio "Richmond"
  node scripts/audit-contacts.js --verbose

Output:
  audit-reports/audit-YYYY-MM-DD-HHmmss.md   Human-readable report
  audit-reports/audit-YYYY-MM-DD-HHmmss.json Machine-readable data
`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Set defaults: last 7 days
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const fromDate = validateDate(options.fromDate, 'from') || sevenDaysAgo;
  const toDate = validateDate(options.toDate, 'to') || now;

  // Validate date range
  if (fromDate > toDate) {
    console.error('Error: --from date must be before --to date');
    process.exit(1);
  }

  console.log('SMS Audit Script');
  console.log('================');
  console.log(`Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);
  if (options.studioFilter) {
    console.log(`Studio filter: ${options.studioFilter}`);
  }
  if (options.verbose) {
    console.log('Verbose mode: enabled');
  }
  console.log('');

  try {
    await runAudit({
      fromDate,
      toDate,
      studioFilter: options.studioFilter,
      verbose: options.verbose,
    });
    process.exit(0);
  } catch (error) {
    console.error('\nFatal error:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

main();
