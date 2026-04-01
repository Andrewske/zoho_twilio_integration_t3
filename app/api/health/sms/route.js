import { NextResponse } from 'next/server';
import { prisma } from '~/utils/prisma';
import { logError } from '~/utils/logError';

const ORPHAN_WHERE = {
  twilioMessageId: { not: null },
  isWelcomeMessage: false,
  isFollowUpMessage: false,
  studioId: null,
  retryCount: { lt: 50 },
  createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  ZohoTask: { none: {} },
};

const formatAge = (createdAt) => {
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}min`;
};

const isUnhealthyCron = (lastCronRun) => {
  if (!lastCronRun) return true;
  const age = Date.now() - new Date(lastCronRun.startedAt).getTime();
  return age > 15 * 60 * 1000;
};

const deriveStatus = (orphanedMessages, lastCronRun) => {
  if (orphanedMessages >= 10 || isUnhealthyCron(lastCronRun)) return 'unhealthy';
  if (orphanedMessages > 0) return 'degraded';
  return 'healthy';
};

export async function GET(request) {
  if (process.env.NODE_ENV === 'production') {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const [orphanedMessages, unlinkedTasks, lastCronRun, oldestUnprocessed] = await Promise.all([
      prisma.message.count({ where: ORPHAN_WHERE }),
      prisma.zohoTask.count({ where: { contactId: null } }),
      prisma.cronRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      prisma.message.findFirst({ where: ORPHAN_WHERE, orderBy: { createdAt: 'asc' } }),
    ]);

    return NextResponse.json({
      orphanedMessages,
      unlinkedTasks,
      lastCronRun: lastCronRun?.startedAt?.toISOString() ?? null,
      oldestUnprocessed: oldestUnprocessed ? formatAge(oldestUnprocessed.createdAt) : null,
      status: deriveStatus(orphanedMessages, lastCronRun),
    });
  } catch (error) {
    logError({ error, location: 'GET /api/health/sms', context: 'health check query failed' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
