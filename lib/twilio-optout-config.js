// Twilio sender accounts whose Consent Management list should be
// synchronized with Zoho opt-outs. Currently the philip_admin Twilio
// account is the only one sending mass campaigns / Bookings reminders /
// shared agent traffic, so it is the only one in scope.
//
// Adding a new sender requires updating both maps and redeploying.
// TODO: migrate to Account.optOutSenderId schema column when other
// studios begin sending mass campaigns from their own numbers.

export const TWILIO_OPTOUT_SENDER_ACCOUNTS = [
  'wjnh2dwip22wp0o5uw4o460v', // philip_admin Twilio account
];

export const TWILIO_OPTOUT_SENDER_NUMBERS = {
  wjnh2dwip22wp0o5uw4o460v: '+13466161442',
};
