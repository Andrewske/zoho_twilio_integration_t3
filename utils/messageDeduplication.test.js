import { areMessagesDuplicates } from './messageDeduplication';

describe('areMessagesDuplicates', () => {
  const baseDb = {
    message: 'hello world',
    fromNumber: '2817584707',
    toNumber: '3465655190',
    createdAt: '2026-04-23T20:18:06.000Z',
  };

  const baseZohoLog = {
    message: 'hello world',
    senderId: '+12817584707',
    customerNumber: '+13465655190',
    submittedTime: '2026-04-23T20:18:03.000Z',
  };

  it('matches DB message against Zoho log with submittedTime within window', () => {
    expect(areMessagesDuplicates(baseDb, baseZohoLog)).toBe(true);
  });

  it('does not match when timestamps outside window', () => {
    expect(
      areMessagesDuplicates(baseDb, {
        ...baseZohoLog,
        submittedTime: '2026-04-23T20:05:00.000Z',
      })
    ).toBe(false);
  });

  it('does not match when message text differs', () => {
    expect(
      areMessagesDuplicates(baseDb, { ...baseZohoLog, message: 'different' })
    ).toBe(false);
  });

  it('does not match when phone numbers differ', () => {
    expect(
      areMessagesDuplicates(baseDb, { ...baseZohoLog, customerNumber: '+15550001111' })
    ).toBe(false);
  });

  it('returns false when Zoho log has no parseable timestamp', () => {
    const noTimestamp = { ...baseZohoLog };
    delete noTimestamp.submittedTime;
    expect(areMessagesDuplicates(baseDb, noTimestamp)).toBe(false);
  });

  it('returns false when DB message has no parseable timestamp', () => {
    const noTimestamp = { ...baseDb };
    delete noTimestamp.createdAt;
    expect(areMessagesDuplicates(noTimestamp, baseZohoLog)).toBe(false);
  });

  it('normalizes phone formats (E.164 vs 10-digit) to match', () => {
    expect(
      areMessagesDuplicates(baseDb, { ...baseZohoLog, senderId: '12817584707' })
    ).toBe(true);
  });
});
