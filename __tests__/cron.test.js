/**
 * @jest-environment node
 */
import { GET } from '~/app/api/cron/route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('~/utils/prisma', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    cronRun: {
      create: jest.fn(),
      update: jest.fn(),
    },
    zohoTask: {
      create: jest.fn(),
    },
  },
}));

jest.mock('~/actions/zoho/contact/lookupContact', () => ({
  lookupContact: jest.fn(),
}));

jest.mock('~/actions/zoho/contact/smsOptOut', () => ({
  smsOptOut: jest.fn(),
}));

jest.mock('~/actions/zoho/sendFollowUp', () => ({
  sendFollowUp: jest.fn(),
}));

jest.mock('~/utils/studio-lookups', () => ({
  getStudioFromPhoneNumber: jest.fn(),
  getStudioFromZohoId: jest.fn(),
  findAdminStudioByPhone: jest.fn(),
}));

jest.mock('~/actions/zoho/tasks', () => ({
  createTask: jest.fn(),
  createUnlinkedTask: jest.fn(),
}));

jest.mock('~/utils/messageHelpers', () => ({
  isYesMessage: jest.fn(),
  isStopMessage: jest.fn(),
  hasReceivedFollowUpMessage: jest.fn(),
}));

jest.mock('~/utils/notify', () => ({
  notify: jest.fn(),
}));

jest.mock('~/utils/logError', () => ({
  logError: jest.fn(),
}));

jest.mock('~/utils/postHogServer', () => ({
  captureServerEvent: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { prisma } from '~/utils/prisma';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { sendFollowUp } from '~/actions/zoho/sendFollowUp';
import { findAdminStudioByPhone, getStudioFromPhoneNumber, getStudioFromZohoId } from '~/utils/studio-lookups';
import { createTask, createUnlinkedTask } from '~/actions/zoho/tasks';
import { isYesMessage, isStopMessage, hasReceivedFollowUpMessage } from '~/utils/messageHelpers';
import { notify } from '~/utils/notify';
import { logError } from '~/utils/logError';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRequest = (authenticated = true) => {
  const headers = {};
  if (authenticated) headers['authorization'] = `Bearer ${process.env.CRON_SECRET}`;
  return new Request('http://localhost/api/cron', { headers });
};

const makeMessage = (overrides = {}) => ({
  id: 'msg1',
  fromNumber: '5551234567',
  toNumber: '5559876543',
  message: 'hello',
  twilioMessageId: 'SM123',
  retryCount: 0,
  ...overrides,
});

const STUDIO = { id: 'studio1', name: 'Test Studio', zohoId: 'zoho1' };
const CONTACT = { id: 'contact1', Mobile: '5551234567', Owner: { id: 'owner1' } };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  process.env.CRON_SECRET = 'test-secret';
});

beforeEach(() => {
  jest.clearAllMocks();

  // Default: cron run bookkeeping always resolves
  prisma.cronRun.create.mockResolvedValue({ id: 'cron1' });
  prisma.cronRun.update.mockResolvedValue({});
  prisma.message.update.mockResolvedValue({});
  prisma.zohoTask.create.mockResolvedValue({});

  // Default helper behaviour — individual tests override as needed
  isYesMessage.mockReturnValue(false);
  isStopMessage.mockReturnValue(false);
  hasReceivedFollowUpMessage.mockResolvedValue(false);

  getStudioFromPhoneNumber.mockResolvedValue(STUDIO);
  getStudioFromZohoId.mockResolvedValue(STUDIO);
  findAdminStudioByPhone.mockResolvedValue(null);
  lookupContact.mockResolvedValue(CONTACT);
  createTask.mockResolvedValue({ zohoTaskId: 'zt1', taskSubject: 'SMS from lead', taskStatus: 'Open' });
  createUnlinkedTask.mockResolvedValue({});
  sendFollowUp.mockResolvedValue({});
  smsOptOut.mockResolvedValue({});
  notify.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron', () => {
  // 1. No unprocessed messages
  it('returns ok with "No unprocessed messages" and creates a CronRun when queue is empty', async () => {
    prisma.message.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toBe('No unprocessed messages');
    expect(body.cronRunId).toBe('cron1');
    expect(prisma.cronRun.create).toHaveBeenCalledTimes(1);
    expect(prisma.cronRun.update).toHaveBeenCalledTimes(1);
  });

  // 2. Yes message + contact found + new lead → sendFollowUp
  it('calls sendFollowUp for a yes message when the contact has not yet received a follow-up', async () => {
    const msg = makeMessage({ message: 'yes' });
    prisma.message.findMany.mockResolvedValue([msg]);
    isYesMessage.mockReturnValue(true);
    hasReceivedFollowUpMessage.mockResolvedValue(false);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(sendFollowUp).toHaveBeenCalledTimes(1);
    expect(sendFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ contact: CONTACT, studio: STUDIO })
    );
  });

  // 3. Yes message + contact found + already has follow-up → dedup, skip sendFollowUp
  it('skips sendFollowUp when the contact has already received a follow-up (dedup)', async () => {
    prisma.message.findMany.mockResolvedValue([makeMessage({ message: 'yes' })]);
    isYesMessage.mockReturnValue(true);
    hasReceivedFollowUpMessage.mockResolvedValue(true);

    await GET(makeRequest());

    expect(sendFollowUp).not.toHaveBeenCalled();
  });

  // 4. Yes message + contact NOT found → createUnlinkedTask + notify
  it('calls createUnlinkedTask and notifies when yes message has no matching contact', async () => {
    prisma.message.findMany.mockResolvedValue([makeMessage({ message: 'yes' })]);
    isYesMessage.mockReturnValue(true);
    lookupContact.mockResolvedValue(null);

    await GET(makeRequest());

    expect(createUnlinkedTask).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONTACT_NOT_FOUND' })
    );
  });

  // 5. Regular message + contact found → createTask + ZohoTask record
  it('calls createTask and persists a ZohoTask record for a regular inbound message', async () => {
    prisma.message.findMany.mockResolvedValue([makeMessage()]);
    isYesMessage.mockReturnValue(false);
    isStopMessage.mockReturnValue(false);

    await GET(makeRequest());

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(prisma.zohoTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ zohoTaskId: 'zt1' }),
      })
    );
  });

  // 6. Stop message → calls smsOptOut
  it('calls smsOptOut for a stop message', async () => {
    prisma.message.findMany.mockResolvedValue([makeMessage({ message: 'stop' })]);
    isStopMessage.mockReturnValue(true);

    await GET(makeRequest());

    expect(smsOptOut).toHaveBeenCalledTimes(1);
    expect(smsOptOut).toHaveBeenCalledWith(expect.objectContaining({ studio: STUDIO, contact: CONTACT }));
  });

  // 7. Admin studio present on phone → lookupContact uses admin studio's account,
  //    and the owning studio is resolved from the contact's Zoho Owner.id.
  it('resolves studio via getStudioFromZohoId when an admin studio is attached to the receiving number', async () => {
    const ADMIN_STUDIO = { id: 'adminStudio1', name: 'southlake_admin', zohoId: 'adminZoho', isAdmin: true };
    const msg = makeMessage({ toNumber: '5550000000' });
    prisma.message.findMany.mockResolvedValue([msg]);
    findAdminStudioByPhone.mockResolvedValue(ADMIN_STUDIO);

    await GET(makeRequest());

    expect(lookupContact).toHaveBeenCalledWith(
      expect.objectContaining({ studioId: ADMIN_STUDIO.id })
    );
    expect(getStudioFromZohoId).toHaveBeenCalledWith(CONTACT.Owner.id);
  });

  // 8. retryCount incremented on contact not found
  it('increments retryCount on the message when contact lookup returns null', async () => {
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    lookupContact.mockResolvedValue(null);

    await GET(makeRequest());

    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: msg.id },
        data: expect.objectContaining({ retryCount: { increment: 1 } }),
      })
    );
  });

  // 9. retryCount transitions to RETRY_ESCALATE → notify RETRY_EXHAUSTED (one-shot)
  it('sends RETRY_EXHAUSTED notification when retryCount reaches the escalation threshold', async () => {
    // retryCount + 1 === RETRY_ESCALATE (10) → seed at 9, becomes 10 after this run.
    const msg = makeMessage({ retryCount: 9 });
    prisma.message.findMany.mockResolvedValue([msg]);
    lookupContact.mockResolvedValue(null);
    isYesMessage.mockReturnValue(false); // not a yes, just a plain message

    await GET(makeRequest());

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RETRY_EXHAUSTED' })
    );
  });

  // 10. Batch limit — only processes up to 20 messages
  it('processes all 20 messages returned in a full batch without error', async () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage({ id: `msg${i}`, twilioMessageId: `SM${i}` })
    );
    prisma.message.findMany.mockResolvedValue(messages);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.processed).toBe(20);
    // Each message gets an update call (attribution + retry increment)
    expect(prisma.message.update).toHaveBeenCalledTimes(20);
  });

  // 11a. Admin override fired (resolved studio ≠ phone-owner) → createTask
  //      gets apiAccountStudioId = adminStudio.id so the API call uses the
  //      admin's broader-visibility Zoho creds. Otherwise the studio's own
  //      creds may lack read permission on the lead and Zoho rejects the
  //      POST with INVALID_DATA on $.data[0].What_Id.id.
  it('passes apiAccountStudioId to createTask when admin override changes the studio', async () => {
    const ADMIN_STUDIO = { id: 'adminStudio1', name: 'southlake_admin', zohoId: 'adminZoho', isAdmin: true };
    const PHONE_STUDIO = { id: 'phoneStudio', name: 'Southlake', zohoId: 'phoneZoho' };
    const OWNED_STUDIO = { id: 'ownedStudio', name: 'Colleyville', zohoId: 'ownedZoho' };

    getStudioFromPhoneNumber.mockResolvedValue(PHONE_STUDIO);
    findAdminStudioByPhone.mockResolvedValue(ADMIN_STUDIO);
    getStudioFromZohoId.mockResolvedValue(OWNED_STUDIO);
    prisma.message.findMany.mockResolvedValue([makeMessage()]);

    await GET(makeRequest());

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        studioId: OWNED_STUDIO.id,
        apiAccountStudioId: ADMIN_STUDIO.id,
      })
    );
  });

  // 11b. No admin override (resolved studio == phone-owner OR no admin) →
  //      apiAccountStudioId is undefined, createTask falls back to studioId.
  it('omits apiAccountStudioId when admin override does not fire', async () => {
    prisma.message.findMany.mockResolvedValue([makeMessage()]);

    await GET(makeRequest());

    const call = createTask.mock.calls[0][0];
    expect(call.studioId).toBe(STUDIO.id);
    expect(call.apiAccountStudioId).toBeUndefined();
  });

  // 11. Error in processMessage → caught, logged, retryCount still incremented
  it('catches per-message errors, logs them, and increments retryCount without halting the batch', async () => {
    const msg = makeMessage({ id: 'msg-err' });
    prisma.message.findMany.mockResolvedValue([msg]);
    // Force an error mid-processing
    getStudioFromPhoneNumber.mockRejectedValue(new Error('studio lookup failed'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.errors).toBe(1);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Cron: error processing message' })
    );
    // retryCount should still be incremented via the catch block
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: msg.id },
        data: { retryCount: { increment: 1 } },
      })
    );
  });

  // 12. Unauthorized request in production → 401
  it('returns 401 when the request has no auth header and NODE_ENV is production', async () => {
    const originalEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });

    const res = await GET(makeRequest(false));

    expect(res.status).toBe(401);
    // Restore
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
  });
});
