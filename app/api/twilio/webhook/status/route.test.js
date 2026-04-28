import { POST } from './route.js';
import { prisma } from '~/utils/prisma.js';
import twilio from 'twilio';

jest.mock('~/utils/prisma.js', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('~/utils/logError', () => ({
  logError: jest.fn(),
}));

jest.mock('twilio', () => ({
  __esModule: true,
  default: { validateRequest: jest.fn() },
  validateRequest: jest.fn(),
}));

global.Response = function (body, init) {
  return { body, status: init?.status };
};

const buildRequest = (params, signature = 'sig') => ({
  text: jest.fn().mockResolvedValue(new URLSearchParams(params).toString()),
  headers: { get: (k) => (k.toLowerCase() === 'x-twilio-signature' ? signature : null) },
});

describe('POST /api/twilio/webhook/status', () => {
  beforeEach(() => {
    process.env.APP_URL = 'https://example.com';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    twilio.validateRequest.mockReset();
    prisma.message.findUnique.mockReset();
    prisma.message.update.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates Message and returns 200 on valid terminal status', async () => {
    twilio.validateRequest.mockReturnValue(true);
    prisma.message.findUnique.mockResolvedValue({ status: 'sent' });
    prisma.message.update.mockResolvedValue({});

    const req = buildRequest({
      MessageSid: 'SMabc',
      MessageStatus: 'delivered',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { twilioMessageId: 'SMabc' },
      data: { status: 'delivered', errorCode: null, errorMessage: null },
    });
  });

  it('parses errorCode and errorMessage when present', async () => {
    twilio.validateRequest.mockReturnValue(true);
    prisma.message.findUnique.mockResolvedValue({ status: 'sent' });
    prisma.message.update.mockResolvedValue({});

    const req = buildRequest({
      MessageSid: 'SMfail',
      MessageStatus: 'undelivered',
      ErrorCode: '30006',
      ErrorMessage: 'Landline or unreachable carrier',
    });

    await POST(req);
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { twilioMessageId: 'SMfail' },
      data: {
        status: 'undelivered',
        errorCode: 30006,
        errorMessage: 'Landline or unreachable carrier',
      },
    });
  });

  it('skips update on state regression (sent after delivered)', async () => {
    twilio.validateRequest.mockReturnValue(true);
    prisma.message.findUnique.mockResolvedValue({ status: 'delivered' });

    const req = buildRequest({
      MessageSid: 'SMabc',
      MessageStatus: 'sent',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('returns 403 on invalid signature', async () => {
    twilio.validateRequest.mockReturnValue(false);

    const req = buildRequest({ MessageSid: 'SMabc', MessageStatus: 'delivered' });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
  });

  it('returns 200 and warns on unknown SID', async () => {
    twilio.validateRequest.mockReturnValue(true);
    prisma.message.findUnique.mockResolvedValue(null);

    const req = buildRequest({ MessageSid: 'SMghost', MessageStatus: 'delivered' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('returns 200 on malformed body without writes', async () => {
    twilio.validateRequest.mockReturnValue(true);

    const req = buildRequest({ Foo: 'bar' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
  });
});
