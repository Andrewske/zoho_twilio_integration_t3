import { areMessagesDuplicates, deduplicateZohoVoiceMessages } from './messageDeduplication';

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

  it('matches when both messages are empty strings (regression: || treated "" as falsy)', () => {
    const emptyDb = { ...baseDb, message: '' };
    const emptyLog = { ...baseZohoLog, message: '' };
    expect(areMessagesDuplicates(emptyDb, emptyLog)).toBe(true);
  });
});

describe('deduplicateZohoVoiceMessages: status reconciliation', () => {
  function makePrisma(existing) {
    return {
      message: {
        findMany: jest.fn().mockResolvedValue(existing),
      },
    };
  }

  const baseLog = {
    logid: 'ZV-NEW',
    messageType: 'OUTGOING',
    senderId: '+12817584707',
    customerNumber: '+13465655190',
    message: 'hi there',
    submittedTime: '2026-04-28T00:00:00Z',
  };

  it('attaches normalized status to update when matching row has no status', async () => {
    const prisma = makePrisma([
      {
        id: 'm1',
        zohoMessageId: null,
        message: 'hi there',
        fromNumber: '2817584707',
        toNumber: '3465655190',
        createdAt: new Date('2026-04-28T00:00:02Z'),
        status: null,
      },
    ]);

    const { messagesToUpdate, newMessages } = await deduplicateZohoVoiceMessages(
      [{ ...baseLog, status: 'DELIVERED' }],
      prisma,
      '+13465655190'
    );

    expect(newMessages).toHaveLength(0);
    expect(messagesToUpdate).toEqual([
      { messageId: 'm1', zohoMessageId: 'ZV-NEW', status: 'delivered' },
    ]);
  });

  it('does not write status when ZV log status is missing', async () => {
    const prisma = makePrisma([
      {
        id: 'm1',
        zohoMessageId: null,
        message: 'hi there',
        fromNumber: '2817584707',
        toNumber: '3465655190',
        createdAt: new Date('2026-04-28T00:00:02Z'),
        status: null,
      },
    ]);

    const { messagesToUpdate } = await deduplicateZohoVoiceMessages(
      [baseLog],
      prisma,
      '+13465655190'
    );

    expect(messagesToUpdate).toEqual([
      { messageId: 'm1', zohoMessageId: 'ZV-NEW' },
    ]);
  });

  it('skips status update when matching row already has the same status', async () => {
    const prisma = makePrisma([
      {
        id: 'm1',
        zohoMessageId: null,
        message: 'hi there',
        fromNumber: '2817584707',
        toNumber: '3465655190',
        createdAt: new Date('2026-04-28T00:00:02Z'),
        status: 'delivered',
      },
    ]);

    const { messagesToUpdate } = await deduplicateZohoVoiceMessages(
      [{ ...baseLog, status: 'DELIVERED' }],
      prisma,
      '+13465655190'
    );

    expect(messagesToUpdate).toEqual([
      { messageId: 'm1', zohoMessageId: 'ZV-NEW' },
    ]);
  });

});
