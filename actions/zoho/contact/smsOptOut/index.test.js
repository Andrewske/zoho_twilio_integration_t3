import { smsOptOut } from './index';

jest.mock('~/actions/zoho/contact/updateContact', () => ({
  updateContact: jest.fn(),
}));

jest.mock('~/actions/twilio/optOut', () => ({
  addToTwilioOptOut: jest.fn(),
}));

jest.mock('~/lib/twilio-optout-config', () => ({
  TWILIO_OPTOUT_SENDER_ACCOUNTS: ['acct_a', 'acct_b'],
  TWILIO_OPTOUT_SENDER_NUMBERS: { acct_a: '+13466161442', acct_b: '+15551234567' },
}));

jest.mock('~/utils/logError', () => ({ logError: jest.fn() }));

jest.mock('~/utils/prisma', () => ({
  prisma: { account: { findUnique: jest.fn() } },
}));

import { updateContact } from '~/actions/zoho/contact/updateContact';
import { addToTwilioOptOut } from '~/actions/twilio/optOut';
import { prisma } from '~/utils/prisma';
import { logError } from '~/utils/logError';

const studio = { id: 'studio_1', zohoId: 'zoho_studio_1' };
const contact = { id: 'contact_1', isLead: true, Mobile: '5098992771', SMS_Opt_Out: false };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.account.findUnique.mockImplementation(({ where: { id } }) =>
    Promise.resolve({ id, clientId: `${id}_cid`, clientSecret: `${id}_secret` })
  );
});

describe('smsOptOut', () => {
  it('updates Zoho then syncs to every configured Twilio account', async () => {
    updateContact.mockResolvedValue({});
    addToTwilioOptOut.mockResolvedValue({ ok: true });

    await smsOptOut({ studio, contact });

    expect(updateContact).toHaveBeenCalledTimes(1);
    expect(addToTwilioOptOut).toHaveBeenCalledTimes(2);
    expect(addToTwilioOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '5098992771', senderId: '+13466161442', account: expect.objectContaining({ id: 'acct_a' }) })
    );
    expect(addToTwilioOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '5098992771', senderId: '+15551234567', account: expect.objectContaining({ id: 'acct_b' }) })
    );
  });

  it('does NOT sync to Twilio when Zoho update throws', async () => {
    updateContact.mockRejectedValue(new Error('zoho 500'));

    await smsOptOut({ studio, contact });

    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Error updating contact' }));
    expect(addToTwilioOptOut).not.toHaveBeenCalled();
  });

  it('continues iteration when one Twilio account call throws', async () => {
    updateContact.mockResolvedValue({});
    addToTwilioOptOut
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true });

    await smsOptOut({ studio, contact });

    expect(addToTwilioOptOut).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'twilio consent sync iteration failure' })
    );
  });

  it('skips Zoho update when contact already opted out, but still syncs to Twilio (idempotent)', async () => {
    const optedOut = { ...contact, SMS_Opt_Out: true };
    addToTwilioOptOut.mockResolvedValue({ ok: true });

    await smsOptOut({ studio, contact: optedOut });

    expect(updateContact).not.toHaveBeenCalled();
    expect(addToTwilioOptOut).toHaveBeenCalledTimes(2);
  });

  it('skips Twilio sync if account not found in DB', async () => {
    updateContact.mockResolvedValue({});
    prisma.account.findUnique.mockResolvedValue(null);

    await smsOptOut({ studio, contact });

    expect(addToTwilioOptOut).not.toHaveBeenCalled();
  });
});
