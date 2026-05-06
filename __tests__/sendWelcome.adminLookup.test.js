/**
 * @jest-environment node
 *
 * Regression coverage for commit 8a6f7cb (Apr 7 2026), which broke welcome
 * SMS routing for sub-studios with their own twilioPhone. After this fix,
 * Atlanta Midtown / Memorial / Stone Oak / etc. send welcome from
 * philip_admin's smsPhone (3466161442); Southlake / FW / Colleyville send
 * from southlake_admin's smsPhone (4697185726).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('~/utils/prisma', () => ({
  prisma: {
    studio: {
      findFirst: jest.fn(),
    },
    message: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('~/actions/twilio', () => ({
  sendMessage: jest.fn(),
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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { prisma } from '~/utils/prisma';
import { findAdminStudioForStudio } from '~/utils/studio-lookups';
import { sendMessage } from '~/actions/twilio';
import { notify } from '~/utils/notify';
import { logError } from '~/utils/logError';
import { POST } from '~/app/api/zoho/send_welcome/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PHILIP_ADMIN = {
  id: 'philip_admin_id',
  name: 'philip_admin',
  smsPhone: '3466161442',
  twilioPhone: '3466161442',
};

const SOUTHLAKE_ADMIN = {
  id: 'southlake_admin_id',
  name: 'southlake_admin',
  smsPhone: '4697185726',
  twilioPhone: '4697185726',
};

const ATLANTA = {
  id: 'atlanta_id',
  zohoId: 'atlanta_zoho',
  name: 'Atlanta Midtown',
  managerName: 'Michelle',
  smsPhone: '4044765320',
  twilioPhone: '4044765320',
  callPhone: '4044765320',
  active: true,
  isAdmin: false,
};

const SOUTHLAKE = {
  id: 'southlake_id',
  zohoId: 'southlake_zoho',
  name: 'Southlake',
  managerName: 'Lexi',
  smsPhone: '4697185726',
  twilioPhone: '4697185726',
  callPhone: '4697185726',
  active: true,
  isAdmin: false,
};

const ORPHAN_STUDIO = {
  id: 'orphan_id',
  zohoId: 'orphan_zoho',
  name: 'Orphan',
  managerName: 'Nobody',
  smsPhone: '5550000000',
  twilioPhone: '5550000000',
  callPhone: '5550000000',
  active: true,
  isAdmin: false,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  prisma.message.findFirst.mockResolvedValue(null);
  prisma.message.create.mockResolvedValue({ id: 'msg-stub' });
  sendMessage.mockResolvedValue({ twilioMessageId: 'SMxxx' });
  notify.mockResolvedValue({});
});

// ===========================================================================
// findAdminStudioForStudio - helper unit tests
// ===========================================================================

describe('findAdminStudioForStudio()', () => {
  test('sub-studio sharing twilio Account with philip_admin -> resolves philip_admin', async () => {
    prisma.studio.findFirst.mockResolvedValueOnce(PHILIP_ADMIN);
    const admin = await findAdminStudioForStudio(ATLANTA.id);
    expect(admin).toEqual(PHILIP_ADMIN);
    expect(prisma.studio.findFirst).toHaveBeenCalledWith({
      where: {
        isAdmin: true,
        active: true,
        StudioAccount: {
          some: {
            Account: {
              platform: 'twilio',
              StudioAccount: { some: { studioId: ATLANTA.id } },
            },
          },
        },
      },
      select: { id: true, name: true, smsPhone: true, twilioPhone: true },
    });
  });

  test('sub-studio sharing twilio Account with southlake_admin -> resolves southlake_admin', async () => {
    prisma.studio.findFirst.mockResolvedValueOnce(SOUTHLAKE_ADMIN);
    const admin = await findAdminStudioForStudio(SOUTHLAKE.id);
    expect(admin).toEqual(SOUTHLAKE_ADMIN);
  });

  test('admin self-call (philip_admin) -> resolves self', async () => {
    prisma.studio.findFirst.mockResolvedValueOnce(PHILIP_ADMIN);
    const admin = await findAdminStudioForStudio(PHILIP_ADMIN.id);
    expect(admin).toEqual(PHILIP_ADMIN);
  });

  test('studio with no twilio Account link -> resolves null', async () => {
    prisma.studio.findFirst.mockResolvedValueOnce(null);
    const admin = await findAdminStudioForStudio(ORPHAN_STUDIO.id);
    expect(admin).toBeNull();
  });

  test('standalone admin (KevDev with own account, no peers) -> resolves self via own StudioAccount', async () => {
    const kevDev = { id: 'kevdev_id', name: 'KevDev', smsPhone: '5555555555', twilioPhone: null };
    prisma.studio.findFirst.mockResolvedValueOnce(kevDev);
    const admin = await findAdminStudioForStudio(kevDev.id);
    expect(admin).toEqual(kevDev);
  });
});

// ===========================================================================
// POST /api/zoho/send_welcome - route tests
// ===========================================================================

describe('POST /api/zoho/send_welcome', () => {
  const makeRequest = ({ leadId, ownerId, mobile, firstName }) => {
    const body = new URLSearchParams({ leadId, ownerId, mobile, firstName }).toString();
    return new Request('http://localhost/api/zoho/send_welcome', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  };

  test('REGRESSION: Atlanta Midtown lead -> sendMessage called with from=3466161442 (admin shared, NOT 4044765320)', async () => {
    // First findFirst is getStudioFromZohoId -> returns Atlanta
    prisma.studio.findFirst
      .mockResolvedValueOnce(ATLANTA)         // getStudioFromZohoId
      .mockResolvedValueOnce(PHILIP_ADMIN);   // findAdminStudioForStudio

    await POST(makeRequest({
      leadId: 'lead123', ownerId: ATLANTA.zohoId,
      mobile: '6316274644', firstName: 'James',
    }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      from: PHILIP_ADMIN.smsPhone,
      to: '6316274644',
      studioId: ATLANTA.id,
    }));
    // Must NOT use Atlanta's own old number
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      from: ATLANTA.smsPhone,
    }));
    expect(notify).not.toHaveBeenCalled();
  });

  test('Southlake lead -> sendMessage called with from=4697185726 (southlake_admin shared)', async () => {
    prisma.studio.findFirst
      .mockResolvedValueOnce(SOUTHLAKE)
      .mockResolvedValueOnce(SOUTHLAKE_ADMIN);

    await POST(makeRequest({
      leadId: 'lead456', ownerId: SOUTHLAKE.zohoId,
      mobile: '5551112222', firstName: 'Jane',
    }));

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      from: SOUTHLAKE_ADMIN.smsPhone,
    }));
  });

  test('non-admin studio + admin lookup returns null -> emits notify+logError, sendMessage NOT called', async () => {
    prisma.studio.findFirst
      .mockResolvedValueOnce(ORPHAN_STUDIO) // getStudioFromZohoId
      .mockResolvedValueOnce(null);          // findAdminStudioForStudio

    // The route's outer try/catch swallows the throw and returns 200, but the
    // critical guarantee is: notify + logError fire, and sendMessage does NOT.
    await POST(makeRequest({
      leadId: 'lead789', ownerId: ORPHAN_STUDIO.zohoId,
      mobile: '5553334444', firstName: 'Orphan',
    }));

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'welcome.admin_lookup_failed',
      data: expect.objectContaining({
        studioId: ORPHAN_STUDIO.id,
        studioName: ORPHAN_STUDIO.name,
      }),
    }));
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'welcome.admin_lookup_failed',
      level: 'error',
    }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('admin self-call (philip_admin owns the lead) -> sendMessage from own smsPhone (3466161442)', async () => {
    const philipAdminFull = {
      ...PHILIP_ADMIN,
      zohoId: 'philip_admin_zoho',
      managerName: 'Philip',
      callPhone: '3466161442',
      active: true,
      isAdmin: true,
    };
    prisma.studio.findFirst
      .mockResolvedValueOnce(philipAdminFull)
      .mockResolvedValueOnce(PHILIP_ADMIN); // self-link via join

    await POST(makeRequest({
      leadId: 'leadAAA', ownerId: philipAdminFull.zohoId,
      mobile: '5559998888', firstName: 'Self',
    }));

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      from: PHILIP_ADMIN.smsPhone,
    }));
    expect(notify).not.toHaveBeenCalled();
  });

  test('inactive studio -> 200 no-op, no admin lookup, no sendMessage', async () => {
    prisma.studio.findFirst.mockResolvedValueOnce({ ...ATLANTA, active: false });

    const res = await POST(makeRequest({
      leadId: 'leadBBB', ownerId: ATLANTA.zohoId,
      mobile: '5550001111', firstName: 'Inactive',
    }));

    expect(res.status).toBe(200);
    // findFirst called exactly once (only getStudioFromZohoId, no admin lookup)
    expect(prisma.studio.findFirst).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
