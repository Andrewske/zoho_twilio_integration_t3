import { MessageTransformers } from './messageTransformers.js';

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
