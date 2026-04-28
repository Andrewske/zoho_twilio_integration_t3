/**
 * @jest-environment node
 */
import { POST } from '~/app/api/twilio/webhook/route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('~/utils/prisma', () => ({
  prisma: {
    message: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('~/actions/zoho/contact/lookupContact', () => ({
  lookupContact: jest.fn(),
}));

jest.mock('~/actions/zoho/contact/smsOptOut', () => ({
  smsOptOut: jest.fn(),
}));

jest.mock('~/utils/studio-lookups', () => ({
  getStudioFromPhoneNumber: jest.fn(),
  getStudioFromZohoId: jest.fn(),
  findAdminStudioByPhone: jest.fn(),
}));

jest.mock('~/utils/logError', () => ({
  logError: jest.fn(),
}));

// Import mocked modules so tests can configure return values
import { prisma } from '~/utils/prisma';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { smsOptOut } from '~/actions/zoho/contact/smsOptOut';
import { findAdminStudioByPhone, getStudioFromPhoneNumber, getStudioFromZohoId } from '~/utils/studio-lookups';
import { logError } from '~/utils/logError';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRequest = (body) => {
  const params = new URLSearchParams(body);
  return new Request('http://localhost/api/twilio/webhook', {
    method: 'POST',
    body: params.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};

const validBody = {
  To: '+15551112222',
  From: '+15553334444',
  Body: 'Hello there',
  MessageSid: 'SM_TEST_001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  findAdminStudioByPhone.mockResolvedValue(null);
  getStudioFromZohoId.mockResolvedValue(null);
});

describe('POST /api/twilio/webhook', () => {
  it('valid request — creates message and returns 200', async () => {
    prisma.message.create.mockResolvedValueOnce({ id: 42 });

    const res = await POST(makeRequest(validBody));

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('duplicate twilioMessageId (P2002) — falls back to findFirst and returns 200', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prisma.message.create.mockRejectedValueOnce(p2002);
    prisma.message.findFirst.mockResolvedValueOnce({ id: 99 });

    const res = await POST(makeRequest(validBody));

    expect(prisma.message.findFirst).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('invalid request (missing Body field) — returns 500 with Retry-After', async () => {
    const badBody = { To: '+15551112222', From: '+15553334444', MessageSid: 'SM_TEST_002' };
    // No Body → parseRequest throws; message is never saved → messageId stays null → 500

    const res = await POST(makeRequest(badBody));

    expect(res.status).toBe(500);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('stop message + contact found — calls smsOptOut and updates message with studioId', async () => {
    const stopBody = { ...validBody, Body: 'stop', MessageSid: 'SM_STOP_001' };
    const studio = { id: 'studio-1' };
    const contact = { id: 'contact-1' };

    prisma.message.create.mockResolvedValueOnce({ id: 55 });
    getStudioFromPhoneNumber.mockResolvedValueOnce(studio);
    lookupContact.mockResolvedValueOnce(contact);
    prisma.message.update.mockResolvedValueOnce({});

    const res = await POST(makeRequest(stopBody));

    expect(smsOptOut).toHaveBeenCalledWith({ studio, contact });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { studioId: studio.id, contactId: contact.id },
    });
    expect(res.status).toBe(200);
  });

  it('stop message + contact NOT found — returns 200 (cron handles later)', async () => {
    const stopBody = { ...validBody, Body: 'STOP', MessageSid: 'SM_STOP_002' };

    prisma.message.create.mockResolvedValueOnce({ id: 66 });
    getStudioFromPhoneNumber.mockResolvedValueOnce({ id: 'studio-x' });
    lookupContact.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(stopBody));

    expect(smsOptOut).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('stop message + admin studio on phone — uses admin for lookup, Owner-resolved studio for opt-out', async () => {
    const stopBody = { ...validBody, Body: 'stop', MessageSid: 'SM_STOP_ADMIN_001' };
    const adminStudio = { id: 'admin-studio', isAdmin: true };
    const ownedStudio = { id: 'colleyville-studio', zohoId: 'ownerZ' };
    const contact = { id: 'contact-cv', Owner: { id: 'ownerZ' } };

    prisma.message.create.mockResolvedValueOnce({ id: 88 });
    getStudioFromPhoneNumber.mockResolvedValueOnce({ id: 'southlake' });
    findAdminStudioByPhone.mockResolvedValueOnce(adminStudio);
    lookupContact.mockResolvedValueOnce(contact);
    getStudioFromZohoId.mockResolvedValueOnce(ownedStudio);
    prisma.message.update.mockResolvedValueOnce({});

    const res = await POST(makeRequest(stopBody));

    expect(lookupContact).toHaveBeenCalledWith(expect.objectContaining({ studioId: adminStudio.id }));
    expect(smsOptOut).toHaveBeenCalledWith({ studio: ownedStudio, contact });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 88 },
      data: { studioId: ownedStudio.id, contactId: contact.id },
    });
    expect(res.status).toBe(200);
  });

  it('stop message + admin studio but contact has no Owner — opts out using physical studio', async () => {
    const stopBody = { ...validBody, Body: 'stop', MessageSid: 'SM_STOP_NO_OWNER_001' };
    const physicalStudio = { id: 'southlake' };
    const adminStudio = { id: 'admin-studio', isAdmin: true };
    const contact = { id: 'contact-no-owner' }; // no Owner field

    prisma.message.create.mockResolvedValueOnce({ id: 99 });
    getStudioFromPhoneNumber.mockResolvedValueOnce(physicalStudio);
    findAdminStudioByPhone.mockResolvedValueOnce(adminStudio);
    lookupContact.mockResolvedValueOnce(contact);
    prisma.message.update.mockResolvedValueOnce({});

    const res = await POST(makeRequest(stopBody));

    expect(lookupContact).toHaveBeenCalledWith(expect.objectContaining({ studioId: adminStudio.id }));
    expect(getStudioFromZohoId).not.toHaveBeenCalled();
    expect(smsOptOut).toHaveBeenCalledWith({ studio: physicalStudio, contact });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { studioId: physicalStudio.id, contactId: contact.id },
    });
    expect(res.status).toBe(200);
  });

  it('stop message + unknown phone (no studio, no admin) — short-circuits, no lookup, 200', async () => {
    const stopBody = { ...validBody, Body: 'stop', MessageSid: 'SM_STOP_UNKNOWN_001' };

    prisma.message.create.mockResolvedValueOnce({ id: 111 });
    getStudioFromPhoneNumber.mockResolvedValueOnce(null);
    findAdminStudioByPhone.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(stopBody));

    expect(lookupContact).not.toHaveBeenCalled();
    expect(smsOptOut).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('non-stop message — saves message and returns 200 without Zoho calls', async () => {
    prisma.message.create.mockResolvedValueOnce({ id: 77 });

    const res = await POST(makeRequest(validBody));

    expect(getStudioFromPhoneNumber).not.toHaveBeenCalled();
    expect(lookupContact).not.toHaveBeenCalled();
    expect(smsOptOut).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
