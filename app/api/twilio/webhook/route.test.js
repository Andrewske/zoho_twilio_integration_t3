import { POST } from './route.js';
import { prisma } from '~/utils/prisma.js';
import { isStopMessage } from '~/utils/messageHelpers.js';
import { validateTwilioWebhook } from '~/utils/twilioWebhookAuth';

jest.mock('~/utils/prisma.js', () => ({
  prisma: {
    message: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('~/utils/messageHelpers.js', () => ({
  isStopMessage: jest.fn(),
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

jest.mock('~/utils/twilioWebhookAuth', () => ({
  validateTwilioWebhook: jest.fn(),
}));

global.Response = function (body, init) {
  return { body, status: init?.status };
};

const buildRequest = (form, signature = 'sig') => ({
  text: jest.fn().mockResolvedValue(form),
  headers: { get: (k) => (k.toLowerCase() === 'x-twilio-signature' ? signature : null) },
});

describe('POST function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateTwilioWebhook.mockResolvedValue(true);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should save message and return 200 for valid requests', async () => {
    const req = buildRequest('To=%2B11234567890&From=%2B19876543210&Body=Hello%21&MessageSid=SM123');
    prisma.message.create.mockResolvedValue({ id: 'message-id' });
    isStopMessage.mockReturnValue(false);

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  it('writes status: received on inbound message', async () => {
    const req = buildRequest('To=%2B11234567890&From=%2B19876543210&Body=Hi&MessageSid=SM456');
    prisma.message.create.mockResolvedValue({ id: 'm-id' });
    isStopMessage.mockReturnValue(false);

    await POST(req);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'received', twilioMessageId: 'SM456' }),
      })
    );
  });

  it('should return 500 when message cannot be saved', async () => {
    // Missing To and MessageSid — parseBody throws, messageId stays null
    const req = buildRequest('From=%2B987654321&Body=Hello%21');

    const response = await POST(req);
    expect(response.status).toBe(500);
  });

  it('returns 403 on invalid signature without writing message', async () => {
    validateTwilioWebhook.mockResolvedValue(false);
    const req = buildRequest('To=%2B11234567890&From=%2B19876543210&Body=Hi&MessageSid=SMfake');

    const response = await POST(req);
    expect(response.status).toBe(403);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
