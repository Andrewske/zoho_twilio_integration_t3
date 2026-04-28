import { PhoneFormatter } from '~/utils/phoneNumber';

const CONSENT_API_URL = 'https://accounts.twilio.com/v1/Consents/Bulk';

// posthog-js (transitively imported by utils/logError) is a Client
// Component module that breaks plain-Node script imports. Use a lazy
// dynamic import so this file is safely consumable from CLI scripts.
const safeLogError = async (payload) => {
  try {
    const { logError } = await import('~/utils/logError');
    logError(payload);
  } catch {
    console.error(payload.message, payload.error?.message, payload.data);
  }
};

const buildBasicAuth = (clientId, clientSecret) =>
  'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

const logOutcome = (payload) => {
  console.log(JSON.stringify({ event: 'twilio_consent_optout', ...payload }));
};

// Add a phone number to a Twilio Account's Consent Management opt-out list.
// Idempotent on Twilio's side via (contact_id, sender_id) and on our side
// via deterministic correlation_id. Errors are swallowed (logged) — the
// Zoho update at the call site is the source of truth and must not be
// blocked by Twilio outages.
//
// Verification covered by the weekly /scheduled audit script.
export const addToTwilioOptOut = async ({ phone, account, senderId, dateOfConsent }) => {
  const normalizedPhone = PhoneFormatter.forTwilio(phone);
  if (!normalizedPhone || !senderId || !account?.clientId || !account?.clientSecret) {
    logOutcome({ outcome: 'skipped', reason: 'missing_inputs', sender_id: senderId, account_id: account?.id });
    return { skipped: true };
  }
  // Defensive: caller bug could pass non-Twilio account → leak Zoho creds as
  // Basic auth to twilio.com. Reject anything not explicitly platform=twilio.
  if (account.platform !== 'twilio') {
    logOutcome({ outcome: 'skipped', reason: 'wrong_platform', platform: account.platform, sender_id: senderId, account_id: account.id });
    return { skipped: true };
  }

  const correlation_id = `consent-${normalizedPhone}-${senderId}`;
  const body = {
    items: [
      {
        contact_id: normalizedPhone,
        correlation_id,
        sender_id: senderId,
        status: 'opt-out',
        source: 'opt-out-message',
        date_of_consent: (dateOfConsent ?? new Date()).toISOString(),
      },
    ],
  };

  let response;
  try {
    response = await fetch(CONSENT_API_URL, {
      method: 'POST',
      headers: {
        Authorization: buildBasicAuth(account.clientId, account.clientSecret),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    await safeLogError({
      message: 'twilio_consent_optout network error',
      error,
      level: 'warning',
      data: { phone: normalizedPhone, sender_id: senderId, account_id: account.id },
    });
    logOutcome({ outcome: 'error', http_status: null, phone: normalizedPhone, sender_id: senderId, account_id: account.id });
    return { ok: false, error: 'network' };
  }

  if (response.status === 409) {
    logOutcome({ outcome: 'duplicate', http_status: 409, phone: normalizedPhone, sender_id: senderId, account_id: account.id });
    return { ok: true, duplicate: true };
  }

  if (response.ok) {
    logOutcome({ outcome: 'success', http_status: response.status, phone: normalizedPhone, sender_id: senderId, account_id: account.id });
    return { ok: true };
  }

  const text = await response.text().catch(() => '');
  await safeLogError({
    message: 'twilio_consent_optout http error',
    error: new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`),
    level: 'warning',
    data: { phone: normalizedPhone, sender_id: senderId, account_id: account.id, http_status: response.status },
  });
  logOutcome({ outcome: 'error', http_status: response.status, phone: normalizedPhone, sender_id: senderId, account_id: account.id });
  return { ok: false, error: `http_${response.status}` };
};
