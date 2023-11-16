'use server';
import { createTask } from '~/actions/zoho/tasks';
import { lookupLead } from '~/actions/zoho/leads';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import * as Sentry from '@sentry/nextjs';

export async function POST(request) {
  try {
    const message = await parseRequest(request);
    if (!isValidMessage(message)) {
      console.error('Invalid message:', message);
      return new Response(null, { status: 200 });
    }

    let { To: to, From: from, Body: msg } = message;
    console.log('webhook hit', { to, from, msg });
    if (to.startsWith('+1')) {
      to = to.substring(2);
    }
    if (from.startsWith('+1')) {
      from = from.substring(2);
    }

    const studioInfo = await getStudioInfo(to);

    if (studioInfo) {
      const lead = await lookupLead({ from, studioId: studioInfo.id });
      // TODO if there is not a lead look for a student
      await createTask({ studioId: studioInfo.id, zohoId: studioInfo.zohoId, lead, message: { to, from, msg } });
    }
  } catch (error) {
    // TODO: check for an id, or at least log the message so that it doesn't get lost
    Sentry.captureException(error, request);
    console.error('Webhook error:', error.message, request);
  }
  return new Response(null, { status: 200 });
}

export async function parseRequest(request) {
  try {
    const body = await request.text();
    return parse(body);
  } catch (error) {
    console.error('Error parsing request:', error);
  }
}

export async function isValidMessage(message) {
  return Boolean(message && message.to && message.from && message.msg);
}

export async function getStudioInfo(to) {
  try {
    return await prisma.studio.findFirst({
      where: { phone: to.replace('+1', '') },
      select: { id: true, zohoId: true },
    });
  } catch (error) {
    console.error({ message: 'Could not find studio', to });
  }
}
