import { createTask, lookupLead } from '~/actions/zoho';
import { logError } from '~/utils/rollbar';
import { parse } from 'querystring';

import { PrismaClient } from '@prisma/client';

export async function POST(request) {
  const prisma = new PrismaClient();

  // Get the body information from the request
  const body = await request.text();
  const res = parse(body);
  const { To: to, From: from, Body: msg } = res;
  console.log('webhook hit', { to, from, msg });

  if (!to || !from || !msg) {
    return new Response(null, { status: 200 });
  }

  try {
    // get the studio information
    const { id: studioId, zohoId } = await prisma.studio.findFirst({
      where: { phone: to.replace('+1', '') },
      select: { id: true, zohoId: true },
    });

    if (studioId) {
      const lead = await lookupLead({ from, studioId });

      await createTask({ studioId, zohoId, lead, message: { to, from, msg } });
    }
  } catch (error) {
    console.log('here', error);
    logError(error);
  }
  await prisma.$disconnect();
  return new Response(null, { status: 200 });
}
