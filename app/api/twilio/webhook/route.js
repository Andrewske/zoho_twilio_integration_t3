'use server'
import { createTask } from '~/actions/zoho/tasks';
import { lookupLead } from '~/actions/zoho/leads';
import { parse } from 'querystring';
import prisma from '~/utils/prisma';



export async function POST(request) {
  try {
    const message = await parseRequest(request);
    if (!isValidMessage(message)) {
      console.error('Invalid message:', message)
      return new Response(null, { status: 200 });
    }

    const { To: to, From: from, Body: msg } = message;
    console.log('webhook hit', { to, from, msg });

    const studioInfo = await getStudioInfo(to);
    console.log({ studioInfo })
    if (studioInfo) {
      const lead = await lookupLead({ from, studioId: studioInfo.id });
      await createTask({ studioId: studioInfo.id, zohoId: studioInfo.zohoId, lead, message: { to, from, msg } });
    }
  } catch (error) {
    console.error('Error processing request:', error);
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
