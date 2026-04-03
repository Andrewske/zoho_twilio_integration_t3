/**
 * Markdown Report Formatter
 * Generate human-readable audit reports
 */

import fs from 'fs';
import path from 'path';
import { categorizeIssues } from '../analyzer.js';

/**
 * Generate and write markdown report
 * @param {Array} profiles - Contact profiles
 * @param {Object} dateRange - { from: Date, to: Date }
 * @returns {Promise<string>} Path to written file
 */
export const generateMarkdownReport = async (profiles, dateRange) => {
  const content = formatMarkdownReport(profiles, dateRange);
  const filename = getReportFilename('md');
  const filepath = path.join(process.cwd(), 'audit-reports', filename);

  await fs.promises.writeFile(filepath, content, 'utf-8');
  return filepath;
};

/**
 * Format the markdown report content
 * @param {Array} profiles - Contact profiles
 * @param {Object} dateRange - { from: Date, to: Date }
 * @returns {string} Markdown content
 */
const formatMarkdownReport = (profiles, dateRange) => {
  const fromStr = formatDate(dateRange.from);
  const toStr = formatDate(dateRange.to);

  const passCount = profiles.filter(p => p.verdict === 'PASS').length;
  const reviewCount = profiles.filter(p => p.verdict === 'NEEDS REVIEW').length;
  const noActionCount = profiles.filter(p => p.verdict === 'OK - NO ACTION EXPECTED').length;
  const successRate = profiles.length > 0
    ? Math.round((passCount / profiles.length) * 100)
    : 0;

  const issues = categorizeIssues(profiles);

  let md = `# SMS Audit Report: ${fromStr} to ${toStr}

## Summary
- **Contacts with activity:** ${profiles.length}
- **Automation success (PASS):** ${passCount} (${successRate}%)
- **Needs review:** ${reviewCount}
- **No action expected:** ${noActionCount}

`;

  // Issue breakdown table
  const issueEntries = Object.entries(issues).filter(([_, count]) => count > 0);
  if (issueEntries.length > 0) {
    md += `| Issue Type | Count |
|------------|-------|
`;
    for (const [type, count] of issueEntries) {
      md += `| ${formatIssueType(type)} | ${count} |
`;
    }
    md += '\n';
  }

  // Known limitations note
  md += `> **Note:** If a Lead was converted to a Contact in Zoho between the message and this audit, only the Contact's timeline is shown. Historical Lead timeline data is not retrieved.

> **Note:** Contact names are not stored locally. Names may appear in Zoho timeline data when available.

---

`;

  // Individual contact sections - prioritize NEEDS REVIEW
  const sortedProfiles = [...profiles].sort((a, b) => {
    const order = { 'NEEDS REVIEW': 0, 'PASS': 1, 'OK - NO ACTION EXPECTED': 2 };
    return (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3);
  });

  for (const profile of sortedProfiles) {
    md += formatContactSection(profile);
  }

  return md;
};

/**
 * Format a single contact section
 * @param {Object} profile - Contact profile
 * @returns {string} Markdown for this contact
 */
const formatContactSection = (profile) => {
  const phoneDisplay = formatPhoneDisplay(profile.phoneNumber);
  const verdictEmoji = {
    'PASS': '✅',
    'NEEDS REVIEW': '⚠️',
    'OK - NO ACTION EXPECTED': '➖',
  }[profile.verdict] || '❓';

  let md = `### ${phoneDisplay}
**Studio:** ${profile.studioName} | **Contact ID:** ${profile.contactId || 'Unknown'} | **Type:** ${profile.contactType}

`;

  // Zoho error note
  if (profile.zohoError) {
    md += `> ⚠️ Zoho lookup failed: ${profile.zohoError}

`;
  }

  // Message timeline table
  md += `#### Message Timeline (Local)
| Time | Dir | Message | Auto? | Task? |
|------|-----|---------|-------|-------|
`;

  for (const msg of profile.messages) {
    const time = formatTime(msg.timestamp);
    const dir = msg.direction === 'out' ? '→ OUT' : '← IN';
    const content = truncateMessage(msg.content, 40);
    const auto = msg.isWelcome ? '✓ Welcome' : (msg.isFollowUp ? '✓ Follow-up' : '—');
    const task = msg.linkedTaskId ? `✓ Task #${msg.linkedTaskId.slice(-6)}` : '—';

    md += `| ${time} | ${dir} | "${content}" | ${auto} | ${task} |
`;
  }

  md += '\n';

  // Zoho timeline table (if available)
  if (profile.zohoEvents.length > 0) {
    md += `#### Zoho Timeline
| Time | Event | Source | Details |
|------|-------|--------|---------|
`;

    for (const event of profile.zohoEvents) {
      const time = formatTime(event.timestamp);
      const eventType = event.statusChange ? 'Status changed' :
        (event.taskCreated ? 'Task created' : event.event);
      const source = event.source;
      const details = event.statusChange
        ? `${event.statusChange.from} → ${event.statusChange.to}`
        : (event.taskCreated ? `"${event.taskCreated.name}"` : event.details || '—');

      md += `| ${time} | ${eventType} | ${source} | ${details} |
`;
    }

    md += '\n';
  }

  // Cross-reference checklist
  md += `#### Cross-Reference
- [${profile.crossReference.tasksMatchZoho ? 'x' : ' '}] Local tasks match Zoho timeline (${profile.crossReference.localTaskCount} local, ${profile.crossReference.zohoTaskCount} in Zoho)
- [${profile.crossReference.statusUpdatedViaApi ? 'x' : ' '}] Status updated via API after response
- [${profile.crossReference.noConflictingManualEdits ? 'x' : ' '}] No conflicting manual edits during message window

`;

  // Automation path info
  md += `#### Automation Path
- **Expected path:** ${formatAutomationPath(profile.automationPath.expectedPath)}
- **Automation fired:** ${profile.automationPath.automationFired ? 'Yes' : 'No'}

`;

  // Verdict
  md += `**Verdict:** ${verdictEmoji} ${profile.verdict}

---

`;

  return md;
};

/**
 * Get timestamped filename
 * @param {string} ext - File extension
 * @returns {string} Filename
 */
const getReportFilename = (ext) => {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .slice(0, 19);
  return `audit-${timestamp}.${ext}`;
};

/**
 * Format date for display
 * @param {Date} date
 * @returns {string}
 */
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/**
 * Format time for display
 * @param {Date} date
 * @returns {string}
 */
const formatTime = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Format phone for display
 * @param {string} phone
 * @returns {string}
 */
const formatPhoneDisplay = (phone) => {
  if (!phone) return 'Unknown';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
};

/**
 * Truncate message for table display
 * @param {string} msg
 * @param {number} maxLen
 * @returns {string}
 */
const truncateMessage = (msg, maxLen) => {
  if (!msg) return '(empty)';
  const cleaned = msg.replace(/\n/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + '...';
};

/**
 * Format issue type for display
 * @param {string} type
 * @returns {string}
 */
const formatIssueType = (type) => {
  const labels = {
    missingFollowUp: 'Missing follow-up',
    missingTask: 'Missing task',
    zohoLookupFailed: 'Zoho lookup failed',
    taskMismatch: 'Task mismatch',
    unexpectedManualEdit: 'Unexpected manual edit',
    responseNoAutomation: 'Response without automation',
  };
  return labels[type] || type;
};

/**
 * Format automation path for display
 * @param {string} path
 * @returns {string}
 */
const formatAutomationPath = (path) => {
  const labels = {
    yes_response: '"Yes" response → Follow-up + Task',
    non_new_lead: 'Non-new lead → Task only',
    no_action_or_optout: 'Opt-out or no trigger',
    awaiting_response: 'Awaiting response',
    response_no_automation: 'Response received, no automation',
    unknown: 'Unknown',
  };
  return labels[path] || path;
};

export { getReportFilename };
