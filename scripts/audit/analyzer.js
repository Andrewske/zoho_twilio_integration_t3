/**
 * Analyzer Module
 * Build contact profiles and apply automation rules to determine verdicts
 */

import { inferMessageDirection } from './queries.js';

/**
 * Build a complete contact profile combining local data with Zoho timeline
 * @param {Array} contactMessages - Messages for this contact
 * @param {Object} zohoData - { contact, timeline, error? } from timeline fetcher
 * @param {Array} contactTasks - Tasks associated with this contact
 * @returns {Object} Contact profile with verdict
 */
export const buildContactProfile = (contactMessages, zohoData, contactTasks) => {
  const firstMessage = contactMessages[0];
  const studioName = firstMessage?.Studio?.name || 'Unknown';

  // Determine contact phone (the non-studio number)
  const studioPhones = [
    firstMessage?.Studio?.smsPhone,
    firstMessage?.Studio?.twilioPhone,
  ].filter(Boolean).map(p => p.replace(/\D/g, ''));

  const fromNormalized = firstMessage?.fromNumber?.replace(/\D/g, '') || '';
  const toNormalized = firstMessage?.toNumber?.replace(/\D/g, '') || '';
  const phoneNumber = studioPhones.some(sp => fromNormalized.endsWith(sp) || sp.endsWith(fromNormalized))
    ? toNormalized
    : fromNormalized;

  // Build message list with direction and flags
  const messages = contactMessages.map(msg => {
    const linkedTask = contactTasks.find(t => t.messageId === msg.id);
    return {
      id: msg.id,
      timestamp: msg.createdAt,
      direction: inferMessageDirection(msg),
      content: msg.message || '',
      isWelcome: msg.isWelcomeMessage || false,
      isFollowUp: msg.isFollowUpMessage || false,
      linkedTaskId: linkedTask?.zohoTaskId || null,
    };
  });

  // Build Zoho events list
  const zohoEvents = (zohoData.timeline || []).map(event => ({
    timestamp: event.timestamp,
    event: event.action,
    source: event.source,
    details: event.details || '',
    statusChange: event.statusChange || null,
    taskCreated: event.taskCreated || null,
  }));

  // Determine contact type from Zoho data
  const contactType = zohoData.contact?.isLead ? 'Lead' : 'Contact';

  // Build cross-reference checks
  const crossReference = buildCrossReference(messages, zohoEvents, contactTasks);

  // Apply automation rules and determine verdict
  const automationPath = applyAutomationRules(messages, contactTasks);
  const verdict = determineVerdict(messages, crossReference, automationPath, zohoData);

  return {
    phoneNumber,
    contactId: zohoData.contact?.id || null,
    studioName,
    contactType,
    messages,
    zohoEvents,
    crossReference,
    automationPath,
    verdict,
    zohoError: zohoData.error || null,
  };
};

/**
 * Build cross-reference checks between local and Zoho data
 * @param {Array} messages - Processed messages
 * @param {Array} zohoEvents - Zoho timeline events
 * @param {Array} contactTasks - Local tasks
 * @returns {Object} Cross-reference results
 */
const buildCrossReference = (messages, zohoEvents, contactTasks) => {
  // Check if local tasks appear in Zoho timeline
  const localTaskIds = contactTasks.map(t => t.zohoTaskId).filter(Boolean);
  const zohoTaskIds = zohoEvents
    .filter(e => e.taskCreated)
    .map(e => e.taskCreated.id);

  const tasksMatchZoho = localTaskIds.length === 0 ||
    localTaskIds.some(id => zohoTaskIds.includes(id));

  // Check if status was updated via API (after a "yes" message)
  const hasFollowUp = messages.some(m => m.isFollowUp);
  const statusUpdatedViaApi = !hasFollowUp || zohoEvents.some(e =>
    e.source === 'crm_api' && e.statusChange
  );

  // Check for manual edits during message window
  const messageTimestamps = messages.map(m => new Date(m.timestamp).getTime());
  const minTime = Math.min(...messageTimestamps);
  const maxTime = Math.max(...messageTimestamps);

  const manualEdits = zohoEvents.filter(e => {
    const eventTime = new Date(e.timestamp).getTime();
    return e.source === 'crm_ui' &&
      eventTime >= minTime &&
      eventTime <= maxTime + 60000; // 1 minute buffer
  });

  const noConflictingManualEdits = manualEdits.length === 0;

  return {
    tasksMatchZoho,
    statusUpdatedViaApi,
    noConflictingManualEdits,
    localTaskCount: contactTasks.length,
    zohoTaskCount: zohoTaskIds.length,
    manualEditCount: manualEdits.length,
  };
};

/**
 * Apply automation rules based on database flags
 * @param {Array} messages - Processed messages
 * @param {Array} contactTasks - Local tasks
 * @returns {Object} Automation path analysis
 */
const applyAutomationRules = (messages, contactTasks) => {
  const hasWelcome = messages.some(m => m.isWelcome);
  const hasFollowUp = messages.some(m => m.isFollowUp);
  const hasInbound = messages.some(m => m.direction === 'in');
  const hasTask = contactTasks.length > 0;

  // Determine expected automation path
  let expectedPath = 'unknown';
  let automationFired = false;

  if (hasFollowUp) {
    // "Yes" was detected → Follow-up sent + Task created expected
    expectedPath = 'yes_response';
    automationFired = hasTask;
  } else if (hasTask && !hasFollowUp) {
    // Task exists without follow-up → Non-new lead path
    expectedPath = 'non_new_lead';
    automationFired = true;
  } else if (hasWelcome && hasInbound && !hasFollowUp && !hasTask) {
    // Got welcome + response back, but no follow-up/task triggered.
    // Check this *before* the broader hasInbound branch below, otherwise
    // every "got a reply" case collapses into 'no_action_or_optout'.
    expectedPath = 'response_no_automation';
    automationFired = false;
  } else if (hasInbound && !hasTask && !hasFollowUp) {
    // Inbound message with no welcome, task, or follow-up → opt-out or failed
    expectedPath = 'no_action_or_optout';
    automationFired = false; // Can't determine without more context
  } else if (hasWelcome && !hasInbound) {
    // Welcome sent, no response yet
    expectedPath = 'awaiting_response';
    automationFired = true; // Welcome was sent correctly
  }

  return {
    expectedPath,
    automationFired,
    hasWelcome,
    hasFollowUp,
    hasInbound,
    hasTask,
  };
};

/**
 * Determine final verdict for the contact
 * @param {Array} messages - Processed messages
 * @param {Object} crossReference - Cross-reference results
 * @param {Object} automationPath - Automation analysis
 * @param {Object} zohoData - Zoho lookup data
 * @returns {'PASS' | 'NEEDS REVIEW' | 'OK - NO ACTION EXPECTED'}
 */
const determineVerdict = (messages, crossReference, automationPath, zohoData) => {
  // If we couldn't fetch Zoho data, mark for review
  if (zohoData.error && !zohoData.contact) {
    return 'NEEDS REVIEW';
  }

  const { expectedPath, automationFired, hasFollowUp, hasTask } = automationPath;

  // Paths that don't expect automation
  if (expectedPath === 'awaiting_response') {
    return 'OK - NO ACTION EXPECTED';
  }

  if (expectedPath === 'no_action_or_optout' && !hasTask) {
    // Could be opt-out or non-triggering response - needs human review
    return 'NEEDS REVIEW';
  }

  // Check for expected automation success
  if (expectedPath === 'yes_response') {
    // Expect both follow-up and task
    if (hasFollowUp && hasTask && crossReference.tasksMatchZoho) {
      return 'PASS';
    }
    return 'NEEDS REVIEW';
  }

  if (expectedPath === 'non_new_lead') {
    // Task without follow-up is expected
    if (hasTask && crossReference.tasksMatchZoho) {
      return 'PASS';
    }
    return 'NEEDS REVIEW';
  }

  if (expectedPath === 'response_no_automation') {
    // Got response but nothing happened - needs review
    return 'NEEDS REVIEW';
  }

  // Default: if automation fired and cross-references check out
  if (automationFired && crossReference.tasksMatchZoho && crossReference.statusUpdatedViaApi) {
    return 'PASS';
  }

  // Anything unclear gets flagged
  return 'NEEDS REVIEW';
};

/**
 * Categorize issues from a list of profiles
 * @param {Array} profiles - Contact profiles
 * @returns {Object} Issue categories with counts
 */
export const categorizeIssues = (profiles) => {
  const issues = {
    missingFollowUp: 0,
    missingTask: 0,
    zohoLookupFailed: 0,
    taskMismatch: 0,
    unexpectedManualEdit: 0,
    responseNoAutomation: 0,
  };

  for (const profile of profiles) {
    if (profile.verdict !== 'PASS' && profile.verdict !== 'OK - NO ACTION EXPECTED') {
      const { automationPath, crossReference, zohoError } = profile;

      if (zohoError) {
        issues.zohoLookupFailed++;
      } else if (automationPath.expectedPath === 'yes_response' && !automationPath.hasFollowUp) {
        issues.missingFollowUp++;
      } else if (automationPath.expectedPath === 'yes_response' && !automationPath.hasTask) {
        issues.missingTask++;
      } else if (!crossReference.tasksMatchZoho) {
        issues.taskMismatch++;
      } else if (!crossReference.noConflictingManualEdits) {
        issues.unexpectedManualEdit++;
      } else if (automationPath.expectedPath === 'response_no_automation') {
        issues.responseNoAutomation++;
      }
    }
  }

  return issues;
};
