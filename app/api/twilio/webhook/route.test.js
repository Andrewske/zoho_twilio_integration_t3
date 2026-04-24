import { POST, parseRequest } from './route.js';
import { prisma } from '~/utils/prisma.js';
import { isStopMessage } from '~/utils/messageHelpers.js';

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

jest.mock('~/actions/zoho/studio', () => ({
  getStudioFromZohoId: jest.fn(),
}));

jest.mock('~/utils/studioLookup', () => ({
  getStudioFromPhoneNumber: jest.fn(),
  findAdminStudioByPhone: jest.fn(),
}));

jest.mock('~/utils/logError', () => ({
  logError: jest.fn(),
}));

global.Response = function (body, init) {
  return { body, status: init?.status };
};

describe('POST function', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should save message and return 200 for valid requests', async () => {
    const mockRequest = {
      text: jest.fn().mockResolvedValue(
        'To=%2B11234567890&From=%2B19876543210&Body=Hello%21&MessageSid=SM123'
      ),
    };
    prisma.message.create.mockResolvedValue({ id: 'message-id' });
    isStopMessage.mockReturnValue(false);

    const response = await POST(mockRequest);
    expect(response.status).toBe(200);
  });

  it('should return 500 when message cannot be saved', async () => {
    const mockRequest = {
      // Missing To and MessageSid — parseRequest will throw, messageId stays null
      text: jest.fn().mockResolvedValue('From=%2B987654321&Body=Hello%21'),
    };

    const response = await POST(mockRequest);
    expect(response.status).toBe(500);
  });
});

describe('parseRequest function', () => {
  it('should parse URL-encoded form data correctly', async () => {
    const mockBody = 'To=%2B11234567890&From=%2B19876543210&Body=Hello%21&MessageSid=SM123';
    const mockRequest = { text: jest.fn().mockResolvedValue(mockBody) };

    const result = await parseRequest(mockRequest);
    expect(mockRequest.text).toHaveBeenCalled();
    expect(result).toMatchObject({
      to: expect.any(String),
      from: expect.any(String),
      msg: 'Hello!',
      twilioMessageId: 'SM123',
    });
  });

  it('should throw on missing required fields', async () => {
    const mockRequest = {
      text: jest.fn().mockResolvedValue('From=%2B987654321&Body=Hello%21'),
    };
    await expect(parseRequest(mockRequest)).rejects.toThrow('Invalid Twilio Webhook Message');
  });
});
