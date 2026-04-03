import { getTwilioAccount, getMessagesToContact, getMessagesFromContact, sendMessage } from './index';
import twilio from 'twilio';

jest.mock('~/utils/accountManager', () => ({
    AccountManager: {
        getTwilioAccount: jest.fn(),
    },
}));

jest.mock('~/utils/prisma', () => ({
    prisma: {
        message: {
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));

jest.mock('~/utils/studioMappings', () => ({
    StudioMappings: {
        getStudioNamesDict: jest.fn().mockResolvedValue({}),
    },
}));

jest.mock('~/utils/logError', () => ({ logError: jest.fn() }));
jest.mock('twilio');

const mockList = jest.fn();
const mockCreate = jest.fn();

twilio.mockReturnValue({
    messages: {
        create: mockCreate,
        list: mockList,
    },
});

import { AccountManager } from '~/utils/accountManager';
import { prisma } from '~/utils/prisma';

const mockTwilioAccount = { id: 1, platform: 'twilio', clientId: 'ACxxx', clientSecret: 'secret' };

describe('getTwilioAccount', () => {
    it('returns the Twilio account for a given studio ID', async () => {
        AccountManager.getTwilioAccount.mockResolvedValue(mockTwilioAccount);
        const account = await getTwilioAccount('studio1');
        expect(account).toEqual(mockTwilioAccount);
        expect(AccountManager.getTwilioAccount).toHaveBeenCalledWith('studio1');
    });
});

describe('getMessagesToContact', () => {
    it('should return messages to contact', async () => {
        const mockMessages = [
            { to: '123', from: '456', body: 'Hello', dateSent: new Date(), sid: 'SM1' },
        ];
        mockList.mockResolvedValue(mockMessages);

        const result = await getMessagesToContact(twilio(), '123');
        expect(result).toMatchObject([{
            to: expect.any(String),
            from: expect.any(String),
            body: 'Hello',
            fromStudio: true,
        }]);
    });
});

describe('getMessagesFromContact', () => {
    it('should return messages from contact', async () => {
        const mockMessages = [
            { to: '123', from: '456', body: 'Hello', dateSent: new Date(), sid: 'SM2' },
        ];
        mockList.mockResolvedValue(mockMessages);

        const result = await getMessagesFromContact(twilio(), '123');
        expect(result).toMatchObject([{
            to: expect.any(String),
            from: expect.any(String),
            body: 'Hello',
            fromStudio: false,
        }]);
    });
});

describe('sendMessage', () => {
    beforeEach(() => {
        AccountManager.getTwilioAccount.mockResolvedValue(mockTwilioAccount);
        prisma.message.create.mockResolvedValue({ id: 'msg-1' });
    });

    it('should send a message', async () => {
        mockCreate.mockResolvedValue({ sid: 'SM123' });

        await sendMessage({ to: '123', from: '456', message: 'Hello', studioId: '1' });

        expect(mockCreate).toHaveBeenCalledWith({
            body: 'Hello',
            from: '456',
            to: '123',
        });
    });

    it('should still record the message if sending fails', async () => {
        const error = new Error('Failed to send message');
        mockCreate.mockRejectedValue(error);

        // sendMessage catches send errors and records them in DB — does not rethrow
        await sendMessage({ to: '123', from: '456', message: 'Hello', studioId: '1' });

        expect(prisma.message.create).toHaveBeenCalled();
    });
});
