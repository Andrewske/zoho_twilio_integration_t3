/**
 * @jest-environment node
 */
import { GET } from '~/app/api/health/sms/route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('~/utils/prisma', () => ({
  prisma: {
    message: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    zohoTask: {
      count: jest.fn(),
    },
    cronRun: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('~/utils/logError', () => ({
  logError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { prisma } from '~/utils/prisma';
// eslint-disable-next-line no-unused-vars
import { logError } from '~/utils/logError';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRequest = () => new Request('http://localhost/api/health/sms');

/** Returns a cronRun whose startedAt is `ageMs` milliseconds in the past. */
const recentCronRun = (ageMs = 60_000) => ({
  startedAt: new Date(Date.now() - ageMs),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Safe defaults — each test overrides what it needs
  prisma.message.count.mockResolvedValue(0);
  prisma.message.findFirst.mockResolvedValue(null);
  prisma.zohoTask.count.mockResolvedValue(0);
  prisma.cronRun.findFirst.mockResolvedValue(recentCronRun());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/health/sms', () => {
  // 1. Healthy state
  it('reports healthy when there are no orphaned messages and the cron ran recently', async () => {
    prisma.message.count.mockResolvedValue(0);
    // cronRun ran 2 minutes ago — well within the 15-minute threshold
    prisma.cronRun.findFirst.mockResolvedValue(recentCronRun(2 * 60_000));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orphanedMessages).toBe(0);
    expect(body.status).toBe('healthy');
    expect(body.lastCronRun).not.toBeNull();
    expect(body.oldestUnprocessed).toBeNull();
  });

  // 2. Degraded state
  it('reports degraded when there are a small number of orphaned messages (> 0, < 10)', async () => {
    prisma.message.count.mockResolvedValue(3);
    prisma.message.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5 * 60_000) });
    prisma.cronRun.findFirst.mockResolvedValue(recentCronRun(5 * 60_000));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orphanedMessages).toBe(3);
    expect(body.status).toBe('degraded');
    expect(body.oldestUnprocessed).toMatch(/min/); // formatAge always includes "min"
  });

  // 3a. Unhealthy — too many orphaned messages
  it('reports unhealthy when orphanedMessages reaches 10', async () => {
    prisma.message.count.mockResolvedValue(10);
    prisma.message.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 10 * 60_000) });
    prisma.cronRun.findFirst.mockResolvedValue(recentCronRun(5 * 60_000));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orphanedMessages).toBe(10);
    expect(body.status).toBe('unhealthy');
  });

  // 3b. Unhealthy — stale cron (last run > 15 minutes ago)
  it('reports unhealthy when the last cron run is older than 15 minutes', async () => {
    prisma.message.count.mockResolvedValue(0);
    prisma.cronRun.findFirst.mockResolvedValue(recentCronRun(16 * 60_000));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('unhealthy');
  });
});
