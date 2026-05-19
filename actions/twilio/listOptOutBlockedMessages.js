// Page Twilio Messages list for Error 21610 ("attempt to send to unsubscribed
// recipient"). This is the only practical source of "phones Twilio knows
// opted out" — Twilio Consent Management API has no GET/list endpoint.
//
// Client-side re-filter on error_code is defense in depth: Twilio docs do
// not formally guarantee ErrorCode as a query parameter, only as a response
// field. If the server filter regresses, we still get the right set.

const buildBasicAuth = (sid, token) =>
  'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');

const PAGE_SIZE = 1000;
const ERROR_CODE = 21610;
// Twilio Messages retention is ~13 months; 200 pages × 1000 = 200k messages
// safely caps any future runaway loop without truncating legitimate backfills.
const MAX_PAGES = 200;

// account: { clientId (Account SID), clientSecret (Auth Token) }
// sinceDate: Date — earliest DateSent to include
// Returns: array of { to, from, messagingServiceSid, dateSent } sorted by Twilio default order.
export const listOptOutBlockedMessages = async ({ account, sinceDate }) => {
  if (account?.platform !== 'twilio') {
    throw new Error(`listOptOutBlockedMessages: expected platform=twilio, got ${account?.platform}`);
  }
  const sinceParam = sinceDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const auth = buildBasicAuth(account.clientId, account.clientSecret);

  let nextUrl = `https://api.twilio.com/2010-04-01/Accounts/${account.clientId}/Messages.json?ErrorCode=${ERROR_CODE}&DateSent%3E=${sinceParam}&PageSize=${PAGE_SIZE}`;
  const out = [];
  let pages = 0;

  while (nextUrl && pages < MAX_PAGES) {
    pages += 1;
    const resp = await fetch(nextUrl, { headers: { Authorization: auth } });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`twilio messages list ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    for (const m of data.messages || []) {
      if (m.error_code !== ERROR_CODE) continue;
      out.push({
        to: m.to,
        from: m.from,
        messagingServiceSid: m.messaging_service_sid || null,
        dateSent: m.date_sent,
      });
    }
    nextUrl = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }

  return out;
};
