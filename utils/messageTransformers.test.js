import { MessageTransformers, normalizeZohoVoiceStatus } from './messageTransformers.js';

describe('MessageTransformers.dbToUI', () => {
  const base = {
    id: 'm1',
    fromNumber: '+15551234567',
    toNumber: '+15557654321',
    message: 'hi',
    createdAt: new Date('2026-04-27T00:00:00Z'),
    provider: 'twilio',
    twilioMessageId: 'SM1',
    zohoMessageId: null,
    isWelcomeMessage: false,
    isFollowUpMessage: false,
    errorMessage: null,
    errorCode: null,
    Studio: { name: 'studio_a' },
  };

  it("returns 'unknown' when status is null", () => {
    const result = MessageTransformers.dbToUI(
      { ...base, status: null },
      '+15551234567'
    );
    expect(result.status).toBe('unknown');
  });

  it('forwards a populated errorCode', () => {
    const result = MessageTransformers.dbToUI(
      { ...base, status: 'undelivered', errorCode: 30006, errorMessage: 'Landline' },
      '+15551234567'
    );
    expect(result.errorCode).toBe(30006);
    expect(result.errorMessage).toBe('Landline');
  });

  it('forwards null errorCode when missing', () => {
    const result = MessageTransformers.dbToUI(
      { ...base, status: 'delivered' },
      '+15551234567'
    );
    expect(result.errorCode).toBeNull();
  });
});

describe('normalizeZohoVoiceStatus', () => {
  it('lowercases and trims', () => {
    expect(normalizeZohoVoiceStatus('  DELIVERED ')).toBe('delivered');
  });

  it('returns null for null/undefined/empty', () => {
    expect(normalizeZohoVoiceStatus(null)).toBeNull();
    expect(normalizeZohoVoiceStatus(undefined)).toBeNull();
    expect(normalizeZohoVoiceStatus('')).toBeNull();
    expect(normalizeZohoVoiceStatus('   ')).toBeNull();
  });

  it('coerces non-strings', () => {
    expect(normalizeZohoVoiceStatus(0)).toBe('0');
  });
});

describe('MessageTransformers.zohoVoiceToDb', () => {
  it('captures normalized status on outgoing logs', () => {
    const result = MessageTransformers.zohoVoiceToDb(
      {
        messageType: 'OUTGOING',
        senderId: '+15551234567',
        customerNumber: '+15557654321',
        message: 'hi',
        logid: 'L1',
        status: 'DELIVERED',
        submittedTime: '2026-04-28T00:00:00Z',
      },
      'studio-1',
      'contact-1'
    );
    expect(result.status).toBe('delivered');
  });

  it('marks incoming logs as received regardless of ZV status', () => {
    const result = MessageTransformers.zohoVoiceToDb(
      {
        messageType: 'INCOMING',
        senderId: '+15551234567',
        customerNumber: '+15557654321',
        message: 'hi',
        logid: 'L2',
        status: 'DELIVERED',
        submittedTime: '2026-04-28T00:00:00Z',
      },
      'studio-1',
      'contact-1'
    );
    expect(result.status).toBe('received');
  });

  it('returns null status on outgoing log with missing status', () => {
    const result = MessageTransformers.zohoVoiceToDb(
      {
        messageType: 'OUTGOING',
        senderId: '+15551234567',
        customerNumber: '+15557654321',
        message: 'hi',
        logid: 'L3',
        submittedTime: '2026-04-28T00:00:00Z',
      },
      'studio-1',
      'contact-1'
    );
    expect(result.status).toBeNull();
  });
});

describe('MessageTransformers.bulkZohoVoiceToDb', () => {
  it('preserves per-log status normalization', () => {
    const phoneMap = { '+15551234567': { id: 'studio-1' } };
    const result = MessageTransformers.bulkZohoVoiceToDb(
      [
        {
          messageType: 'OUTGOING',
          senderId: '+15551234567',
          customerNumber: '+15557654321',
          message: 'a',
          logid: 'L1',
          status: 'FAILED',
          submittedTime: '2026-04-28T00:00:00Z',
        },
        {
          messageType: 'INCOMING',
          senderId: '+15551234567',
          customerNumber: '+15557654321',
          message: 'b',
          logid: 'L2',
          status: 'IRRELEVANT',
          submittedTime: '2026-04-28T00:00:00Z',
        },
      ],
      phoneMap,
      'contact-1'
    );
    expect(result[0].status).toBe('failed');
    expect(result[1].status).toBe('received');
  });
});
