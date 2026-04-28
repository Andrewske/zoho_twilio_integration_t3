import { addToTwilioOptOut } from './optOut';

jest.mock('~/utils/logError', () => ({ logError: jest.fn() }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const account = { id: 'acct_test', platform: 'twilio', clientId: 'ACxxxx', clientSecret: 'secret' };
const senderId = '+13466161442';

const okResponse = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: jest.fn().mockResolvedValue(''),
});

const errorResponse = (status, text = 'err') => ({
  ok: false,
  status,
  text: jest.fn().mockResolvedValue(text),
});

beforeEach(() => {
  mockFetch.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  console.log.mockClear();
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('addToTwilioOptOut', () => {
  describe('input validation', () => {
    it.each([
      ['missing phone', { phone: null, account, senderId }],
      ['missing senderId', { phone: '5098992771', account, senderId: null }],
      ['missing account', { phone: '5098992771', account: null, senderId }],
      ['missing clientId', { phone: '5098992771', account: { clientSecret: 's' }, senderId }],
    ])('skips on %s', async (_label, args) => {
      const result = await addToTwilioOptOut(args);
      expect(result).toEqual({ skipped: true });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('phone normalization', () => {
    it.each([
      ['raw 10-digit', '5098992771'],
      ['+1 prefix', '+15098992771'],
      ['parens + dashes', '(509) 899-2771'],
      ['11-digit with leading 1', '15098992771'],
    ])('normalizes %s to E.164', async (_label, phone) => {
      mockFetch.mockResolvedValue(okResponse(200));
      await addToTwilioOptOut({ phone, account, senderId, dateOfConsent: new Date('2026-04-27Z') });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.items[0].contact_id).toBe('+15098992771');
    });
  });

  describe('correlation_id', () => {
    it('is deterministic per (phone, sender) pair across retries', async () => {
      mockFetch.mockResolvedValue(okResponse(200));
      await addToTwilioOptOut({ phone: '5098992771', account, senderId, dateOfConsent: new Date('2026-04-27T00:00:00Z') });
      await addToTwilioOptOut({ phone: '5098992771', account, senderId, dateOfConsent: new Date('2026-04-28T12:34:56Z') });
      const id1 = JSON.parse(mockFetch.mock.calls[0][1].body).items[0].correlation_id;
      const id2 = JSON.parse(mockFetch.mock.calls[1][1].body).items[0].correlation_id;
      expect(id1).toBe(id2);
      expect(id1).toBe('consent-+15098992771-+13466161442');
    });
  });

  describe('request shape', () => {
    it('posts to Twilio Consent API with Basic auth', async () => {
      mockFetch.mockResolvedValue(okResponse(200));
      const date = new Date('2026-04-27T15:00:00Z');
      await addToTwilioOptOut({ phone: '5098992771', account, senderId, dateOfConsent: date });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://accounts.twilio.com/v1/Consents/Bulk',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Basic ' + Buffer.from('ACxxxx:secret').toString('base64'),
            'Content-Type': 'application/json',
          }),
        })
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({
        items: [{
          contact_id: '+15098992771',
          correlation_id: 'consent-+15098992771-+13466161442',
          sender_id: '+13466161442',
          status: 'opt-out',
          source: 'opt-out-message',
          date_of_consent: '2026-04-27T15:00:00.000Z',
        }],
      });
    });
  });

  describe('outcomes', () => {
    it('returns ok on 200', async () => {
      mockFetch.mockResolvedValue(okResponse(200));
      const result = await addToTwilioOptOut({ phone: '5098992771', account, senderId });
      expect(result).toEqual({ ok: true });
    });

    it('returns ok+duplicate on 409', async () => {
      mockFetch.mockResolvedValue(errorResponse(409));
      const result = await addToTwilioOptOut({ phone: '5098992771', account, senderId });
      expect(result).toEqual({ ok: true, duplicate: true });
    });

    it('swallows 4xx error and returns failure', async () => {
      mockFetch.mockResolvedValue(errorResponse(401, 'auth failed'));
      const result = await addToTwilioOptOut({ phone: '5098992771', account, senderId });
      expect(result).toEqual({ ok: false, error: 'http_401' });
    });

    it('swallows 5xx error and returns failure', async () => {
      mockFetch.mockResolvedValue(errorResponse(503, 'unavailable'));
      const result = await addToTwilioOptOut({ phone: '5098992771', account, senderId });
      expect(result).toEqual({ ok: false, error: 'http_503' });
    });

    it('swallows network error and returns failure', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await addToTwilioOptOut({ phone: '5098992771', account, senderId });
      expect(result).toEqual({ ok: false, error: 'network' });
    });
  });

  describe('telemetry log', () => {
    it('emits structured outcome log on success', async () => {
      mockFetch.mockResolvedValue(okResponse(200));
      await addToTwilioOptOut({ phone: '5098992771', account, senderId });
      const logs = console.log.mock.calls.map((c) => c[0]);
      const outcomeLog = logs.find((l) => typeof l === 'string' && l.includes('twilio_consent_optout'));
      expect(outcomeLog).toBeDefined();
      const parsed = JSON.parse(outcomeLog);
      expect(parsed).toMatchObject({
        event: 'twilio_consent_optout',
        outcome: 'success',
        http_status: 200,
        phone: '+15098992771',
        sender_id: '+13466161442',
        account_id: 'acct_test',
      });
    });
  });
});
