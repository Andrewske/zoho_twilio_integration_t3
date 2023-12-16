'use server';

import { parse } from 'querystring';
import prisma from '~/utils/prisma';
import * as Sentry from '@sentry/nextjs';
import { sendMessage } from '~/actions/twilio';

export async function POST(request) {
  try {
    const body = await parseRequest(request);
    console.log({ body });
    if (!isValidBody(body)) {
      console.error('Invalid request:', body);
      return new Response(null, { status: 200 });
    }

    let { owner_id, mobile, first_name } = body;

    if (mobile.startsWith('+1')) {
      mobile = mobile.substring(2);
    }

    const {
      id: studioId,
      phone: studioPhone,
      name: studioName,
    } = await getStudioFromZohoId(owner_id);

    if (studioPhone) {
      // TODO: change phone to studio call number
      // TODO: get studio manager names
      const message =
        `Hi ${first_name}, it's Kevin at ` +
        `Fred Astaire Dance Studios - ${studioName}. ` +
        `Would you like to schedule your 2 Intro Lessons? ` +
        `If you would like to schedule a lesson, reply "YES" ` +
        `or call us at ${studioPhone}. ` +
        `If you need to opt-out, reply "STOP"`;

      console.log({ message });
      sendMessage({
        to: mobile,
        from: studioPhone,
        message,
        studioId,
      });
    }
  } catch (error) {
    // TODO: Record the new leas and say they didn't get the welcome message.
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

export async function isValidBody(body) {
  return Boolean(
    body &&
      body.lead_id &&
      body.owner_id &&
      body.lead_name &&
      body.mobile &&
      body.sms_opt_out &&
      body.first_name
  );
}

export async function getStudioFromZohoId(owner_id) {
  try {
    return await prisma.studio.findFirst({
      where: { zohoId: owner_id },
      select: { id: true, phone: true, name: true },
    });
  } catch (error) {
    console.error({ message: 'Could not find studio', owner_id });
    console.error(error.message);
  }
}
