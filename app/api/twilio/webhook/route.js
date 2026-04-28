import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { findAdminStudioByPhone, getStudioFromPhoneNumber, getStudioFromZohoId } from '~/actions/zoho/studio';
import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';
import { isStopMessage } from '~/utils/messageHelpers';
import { prisma } from '~/utils/prisma';

// POST /api/twilio/webhook
// Receives inbound SMS from Twilio. Saves immediately, returns 200.
// All contact resolution, task creation, and follow-up logic is handled by the cron job.
// Only stop messages are handled inline (SMS compliance requires immediate opt-out).
export async function POST(request) {
  let messageId = null;

  try {
    const body = await parseRequest(request);
    messageId = await upsertMessage({ body });

    // Stop messages handled immediately (SMS compliance — TCPA requires instant opt-out)
    // Twilio's Advanced Opt-Out also handles this at the carrier level as a safety net.
    // Contact lookup uses the admin studio's Zoho account when available so STOP
    // replies from shared-phone studios (e.g., Fort Worth/Colleyville) are visible.
    if (isStopMessage(body.msg)) {
      // TODO: unify studio+contact resolution with cron (app/api/cron/route.js).
      // Both branches do admin-routing but diverge on error handling.
      let studio = await getStudioFromPhoneNumber(body.to);
      const adminStudio = await findAdminStudioByPhone(body.to);
      if (!studio && !adminStudio) {
        return new Response(null, { status: 200 });
      }
      const lookupStudioId = adminStudio?.id ?? studio?.id;
      const contact = await lookupContact({ mobile: body.from, studioId: lookupStudioId });
      if (contact?.Owner?.id) {
        const owned = await getStudioFromZohoId(contact.Owner.id);
        if (owned) studio = owned;
      }
      if (contact && studio) {
        await smsOptOut({ studio, contact });
        await prisma.message.update({
          where: { id: messageId },
          data: { studioId: studio.id, contactId: contact.id },
        });
      }
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    logError({
      message: 'Error in Twilio Webhook',
      error,
      level: 'error',
      data: { messageId },
    });
    // If message was saved, return 200 — cron will handle processing
    // If message was NOT saved (upsert failed), return 500 so Twilio retries
    if (messageId) return new Response(null, { status: 200 });
    return new Response('save failed', { status: 500, headers: { 'Retry-After': '60' } });
  }
}

export const parseRequest = async (request) => {
  const text = await request.text();
  const body = new URLSearchParams(text);
  const to = formatMobile(body.get('To'));
  const from = formatMobile(body.get('From'));
  const msg = body.get('Body');
  const twilioMessageId = body.get('MessageSid');

  if (!to || !from || !msg || !twilioMessageId) {
    throw new Error('Invalid Twilio Webhook Message');
  }

  return { to, from, msg, twilioMessageId };
};

// Idempotent message creation — handles Twilio retries gracefully
// On duplicate twilioMessageId (P2002), returns existing message id
const upsertMessage = async ({ body }) => {
  const { to, from, msg, twilioMessageId } = body;

  try {
    const { id } = await prisma.message.create({
      data: {
        fromNumber: formatMobile(from),
        toNumber: formatMobile(to),
        message: msg,
        twilioMessageId,
        status: 'received',
      },
      select: { id: true },
    });
    return id;
  } catch (error) {
    // P2002 = unique constraint violation (Twilio retry with same MessageSid)
    if (error.code === 'P2002') {
      const existing = await prisma.message.findFirst({
        where: { twilioMessageId },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw error;
  }
};
