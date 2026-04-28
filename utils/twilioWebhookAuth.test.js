import { validateTwilioWebhook } from './twilioWebhookAuth.js';
import { prisma } from '~/utils/prisma.js';
import twilio from 'twilio';

jest.mock('~/utils/prisma.js', () => ({
  prisma: { account: { findFirst: jest.fn() } },
}));

jest.mock('twilio', () => ({
  __esModule: true,
  default: { validateRequest: jest.fn() },
  validateRequest: jest.fn(),
}));

const buildRequest = (signature = 'sig') => ({
  headers: { get: (k) => (k.toLowerCase() === 'x-twilio-signature' ? signature : null) },
});

describe('validateTwilioWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_URL = 'https://example.com';
  });

  it('looks up auth token by AccountSid and validates with that token', async () => {
    prisma.account.findFirst.mockResolvedValue({ clientSecret: 'TOK_PHILIP' });
    twilio.validateRequest.mockReturnValue(true);

    const params = new URLSearchParams({ AccountSid: 'AC_PHILIP', MessageSid: 'SM1' });
    const valid = await validateTwilioWebhook({
      request: buildRequest(),
      params,
      pathname: '/api/twilio/webhook',
    });

    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { platform: 'twilio', clientId: 'AC_PHILIP' },
      select: { clientSecret: true },
    });
    expect(twilio.validateRequest).toHaveBeenCalledWith(
      'TOK_PHILIP',
      'sig',
      'https://example.com/api/twilio/webhook',
      { AccountSid: 'AC_PHILIP', MessageSid: 'SM1' },
    );
    expect(valid).toBe(true);
  });

  it('uses different auth token for different AccountSid', async () => {
    prisma.account.findFirst.mockResolvedValue({ clientSecret: 'TOK_SOUTHLAKE' });
    twilio.validateRequest.mockReturnValue(true);

    const params = new URLSearchParams({ AccountSid: 'AC_SOUTHLAKE' });
    await validateTwilioWebhook({
      request: buildRequest(),
      params,
      pathname: '/api/twilio/webhook',
    });

    expect(twilio.validateRequest).toHaveBeenCalledWith(
      'TOK_SOUTHLAKE',
      expect.any(String),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('returns false when AccountSid is missing', async () => {
    const params = new URLSearchParams({ MessageSid: 'SM1' });
    const valid = await validateTwilioWebhook({
      request: buildRequest(),
      params,
      pathname: '/api/twilio/webhook',
    });
    expect(valid).toBe(false);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });

  it('returns false when signature header is missing', async () => {
    const params = new URLSearchParams({ AccountSid: 'AC_X' });
    const valid = await validateTwilioWebhook({
      request: buildRequest(''),
      params,
      pathname: '/api/twilio/webhook',
    });
    expect(valid).toBe(false);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });

  it('returns false when no Account row matches the AccountSid', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    const params = new URLSearchParams({ AccountSid: 'AC_UNKNOWN' });
    const valid = await validateTwilioWebhook({
      request: buildRequest(),
      params,
      pathname: '/api/twilio/webhook',
    });
    expect(valid).toBe(false);
    expect(twilio.validateRequest).not.toHaveBeenCalled();
  });

  it('returns false when twilio.validateRequest rejects', async () => {
    prisma.account.findFirst.mockResolvedValue({ clientSecret: 'TOK' });
    twilio.validateRequest.mockReturnValue(false);
    const params = new URLSearchParams({ AccountSid: 'AC_X' });
    const valid = await validateTwilioWebhook({
      request: buildRequest(),
      params,
      pathname: '/api/twilio/webhook',
    });
    expect(valid).toBe(false);
  });
});
