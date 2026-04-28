import 'server-only';
import twilio from 'twilio';
import { prisma } from '~/utils/prisma';

// Twilio signs each webhook with the auth token of the *sending* account.
// We host studios across multiple Twilio accounts (e.g. philip_admin uses one
// account, southlake_admin another) — a single env-var auth token cannot
// validate signatures from more than one. Twilio includes `AccountSid` in
// every webhook payload; we look up the matching Account row by `clientId`
// and validate against its `clientSecret`.
export const validateTwilioWebhook = async ({ request, params, pathname }) => {
  const signature = request.headers?.get?.('x-twilio-signature') || '';
  const accountSid = params.get('AccountSid');
  if (!signature || !accountSid) return false;

  const account = await prisma.account.findFirst({
    where: { platform: 'twilio', clientId: accountSid },
    select: { clientSecret: true },
  });
  if (!account?.clientSecret) return false;

  const url = `${process.env.APP_URL}${pathname}`;
  const paramsObj = Object.fromEntries(params.entries());
  return twilio.validateRequest(account.clientSecret, signature, url, paramsObj);
};
