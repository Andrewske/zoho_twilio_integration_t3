/**
 * JSON Report Formatter
 * Generate machine-readable audit reports
 */

import fs from 'fs';
import path from 'path';
import { categorizeIssues } from '../analyzer.js';
import { getReportFilename } from './markdown.js';

/**
 * Generate and write JSON report
 * @param {Array} profiles - Contact profiles
 * @param {Object} dateRange - { from: Date, to: Date }
 * @returns {Promise<string>} Path to written file
 */
export const generateJsonReport = async (profiles, dateRange) => {
  const data = formatJsonReport(profiles, dateRange);
  const filename = getReportFilename('json');
  const filepath = path.join(process.cwd(), 'audit-reports', filename);

  await fs.promises.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return filepath;
};

/**
 * Format the JSON report data
 * @param {Array} profiles - Contact profiles
 * @param {Object} dateRange - { from: Date, to: Date }
 * @returns {Object} JSON report data
 */
const formatJsonReport = (profiles, dateRange) => {
  const passCount = profiles.filter(p => p.verdict === 'PASS').length;
  const reviewCount = profiles.filter(p => p.verdict === 'NEEDS REVIEW').length;
  const noActionCount = profiles.filter(p => p.verdict === 'OK - NO ACTION EXPECTED').length;

  const issues = categorizeIssues(profiles);

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: dateRange.from.toISOString().split('T')[0],
      to: dateRange.to.toISOString().split('T')[0],
    },
    summary: {
      totalContacts: profiles.length,
      automationSuccess: passCount,
      needsReview: reviewCount,
      noActionExpected: noActionCount,
      successRate: profiles.length > 0
        ? Math.round((passCount / profiles.length) * 100) / 100
        : 0,
      issues,
    },
    contacts: profiles.map(profile => ({
      phone: profile.phoneNumber,
      studio: profile.studioName,
      contactId: profile.contactId,
      type: profile.contactType,
      verdict: profile.verdict,
      automationPath: profile.automationPath,
      messages: profile.messages.map(m => ({
        id: m.id,
        timestamp: m.timestamp,
        direction: m.direction,
        content: m.content,
        isWelcome: m.isWelcome,
        isFollowUp: m.isFollowUp,
        linkedTaskId: m.linkedTaskId,
      })),
      zohoTimeline: profile.zohoEvents.map(e => ({
        timestamp: e.timestamp,
        event: e.event,
        source: e.source,
        details: e.details,
        statusChange: e.statusChange,
        taskCreated: e.taskCreated,
      })),
      crossReference: profile.crossReference,
      zohoError: profile.zohoError,
    })),
  };
};
