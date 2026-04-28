import twilio from 'twilio';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';

// Ordinal map prevents out-of-order callbacks from demoting terminal state.
// queued < sending < sent < (delivered | undelivered | failed).
const STATUS_ORDER = {
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  undelivered: 4,
  failed: 4,
};

const isRegression = (incoming, existing) => {
  if (!existing || !(existing in STATUS_ORDER)) return false;
  if (!(incoming in STATUS_ORDER)) return false;
  return STATUS_ORDER[incoming] < STATUS_ORDER[existing];
};

// POST /api/twilio/webhook/status
// Twilio's MessageStatus callback. Validates signature, then updates the
// stored Message row with the new status, errorCode, errorMessage.
export async function POST(request) {
  try {
    const rawBody = await request.text();
    const params = new URLSearchParams(rawBody);

    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.APP_URL}/api/twilio/webhook/status`;
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';

    const paramsObj = Object.fromEntries(params.entries());
    const valid = twilio.validateRequest(authToken, signature, url, paramsObj);
    if (!valid) {
      return new Response('invalid signature', { status: 403 });
    }

    const MessageSid = params.get('MessageSid');
    const MessageStatus = params.get('MessageStatus');
    if (!MessageSid || !MessageStatus) {
      return new Response(null, { status: 200 });
    }

    const ErrorCode = params.get('ErrorCode');
    const ErrorMessage = params.get('ErrorMessage');
    const errorCode = ErrorCode ? Number.parseInt(ErrorCode, 10) : null;
    const errorMessage = ErrorMessage || null;

    const existing = await prisma.message.findUnique({
      where: { twilioMessageId: MessageSid },
      select: { status: true },
    });

    if (!existing) {
      logError({
        message: 'Twilio status callback for unknown SID',
        level: 'warn',
        data: { MessageSid, MessageStatus },
      });
      return new Response(null, { status: 200 });
    }

    if (isRegression(MessageStatus, existing.status)) {
      return new Response(null, { status: 200 });
    }

    try {
      await prisma.message.update({
        where: { twilioMessageId: MessageSid },
        data: {
          status: MessageStatus,
          errorCode: Number.isFinite(errorCode) ? errorCode : null,
          errorMessage,
        },
      });
    } catch (error) {
      // P2025 — record vanished between findUnique and update; safe to ignore.
      if (error.code === 'P2025') {
        logError({
          message: 'Twilio status callback: record disappeared',
          level: 'warn',
          data: { MessageSid },
        });
        return new Response(null, { status: 200 });
      }
      throw error;
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    logError({
      message: 'Error in Twilio status webhook',
      error,
      level: 'error',
    });
    return new Response('error', { status: 500 });
  }
}
