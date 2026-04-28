// Check whether philip_admin campaign sends carry a messagingServiceSid
// (= going through a Twilio Messaging Service) or are raw From-number sends.
import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] ||= m[2].replace(/^"|"$/g, '');
}
const { prisma } = await import('../utils/prisma.js');
const twilioMod = await import('twilio');
const twilio = twilioMod.default;

const studio = await prisma.studio.findFirst({
  where: { name: 'philip_admin' },
  include: { StudioAccount: { include: { Account: true } } },
});
const acct = studio.StudioAccount.map(sa => sa.Account).find(a => a.platform === 'twilio');
const client = twilio(acct.clientId, acct.clientSecret, { region: 'US1', edge: 'umatilla' });

// Campaign sample SIDs from earlier audit (the leaked deliveries)
const knownSids = [
  'SMab1a9e7cdfa77a44d288335649011440', // Sept 20 "Blanca Liliana, do you want to feel..."
  'SM62cd83b2f641c36652b02e635df57db7', // Sept 16 "💃 Did you hear?"
  'SMc06ea502420995840c6c4c79faf626cb', // Sept 1 "🔥 Last Chance!"
  'SM5c2eb35052741f4f41dfc107212aa3ce', // Aug 31 "⏰ 48 Hours Left!"
  'SM260998e591d179ba3a2c6d58b4f2c67b', // Aug 28 "LABOR DAY SALE!"
];

console.log('=== known historical campaign sends ===');
for (const sid of knownSids) {
  try {
    const m = await client.messages(sid).fetch();
    console.log({
      sid: m.sid,
      dateSent: m.dateSent?.toISOString(),
      from: m.from,
      messagingServiceSid: m.messagingServiceSid || '(none)',
      status: m.status,
      errorCode: m.errorCode,
      bodyPreview: (m.body || '').slice(0, 50),
    });
  } catch (e) {
    console.log(`  ${sid}: ${e.message}`);
  }
}

// Also pull the most recent 10 sends to inspect today's campaign state
console.log('\n=== 10 most recent sends from philip_admin ===');
const recent = await client.messages.list({
  from: studio.twilioPhone,
  limit: 10,
});
for (const m of recent) {
  console.log({
    sid: m.sid,
    dateSent: m.dateSent?.toISOString(),
    from: m.from,
    messagingServiceSid: m.messagingServiceSid || '(none)',
    status: m.status,
    errorCode: m.errorCode,
    bodyPreview: (m.body || '').slice(0, 50),
  });
}
await prisma.$disconnect();
