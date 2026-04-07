import { isYesMessage, isStopMessage, isAdminNumber } from '~/utils/messageHelpers';
import { prisma } from '~/utils/prisma';

jest.mock('~/utils/prisma', () => ({
  prisma: {
    studio: { findFirst: jest.fn() },
  },
}));

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// isYesMessage
// ---------------------------------------------------------------------------

describe('isYesMessage', () => {
  it('matches all 9 accepted yes patterns (including case variations)', () => {
    const positives = [
      'yes', 'yes!', 'yes.', 'yes please', 'yeah', 'yep', 'yea', 'sure', 'absolutely',
      // case variations
      'YES', 'Yeah', 'SURE', 'Absolutely',
      // leading/trailing whitespace
      '  yes  ',
    ];
    positives.forEach((msg) => {
      expect(isYesMessage(msg)).toBe(true);
    });
  });

  it('rejects non-yes messages', () => {
    const negatives = ['no', 'hello', 'yes sir', 'yesterday', ''];
    negatives.forEach((msg) => {
      expect(isYesMessage(msg)).toBe(false);
    });
  });

  it('handles null and undefined gracefully (returns false, does not throw)', () => {
    expect(() => isYesMessage(null)).not.toThrow();
    expect(isYesMessage(null)).toBe(false);

    expect(() => isYesMessage(undefined)).not.toThrow();
    expect(isYesMessage(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStopMessage
// ---------------------------------------------------------------------------

describe('isStopMessage', () => {
  it('matches "stop" in various cases and trims whitespace', () => {
    expect(isStopMessage('stop')).toBe(true);
    expect(isStopMessage('STOP')).toBe(true);
    expect(isStopMessage('Stop')).toBe(true);
    expect(isStopMessage(' stop ')).toBe(true);
  });

  it('rejects partial matches and non-stop messages', () => {
    expect(isStopMessage('stopping')).toBe(false);
    expect(isStopMessage("don't stop")).toBe(false);
    expect(isStopMessage('please stop')).toBe(false);
    expect(isStopMessage('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAdminNumber
// ---------------------------------------------------------------------------

describe('isAdminNumber', () => {
  it('returns true when a matching admin studio exists', async () => {
    prisma.studio.findFirst.mockResolvedValue({ id: 'admin-1' });
    expect(await isAdminNumber('+15550000000')).toBe(true);
  });

  it('returns false when no admin studio matches', async () => {
    prisma.studio.findFirst.mockResolvedValue(null);
    expect(await isAdminNumber('+15551111111')).toBe(false);
    expect(await isAdminNumber(null)).toBe(false);
  });
});
