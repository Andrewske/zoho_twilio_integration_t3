import { getTwilioAccount } from './index';
import prisma from '~/utils/prisma';
import { getMessagesToContact, getMessagesFromContact, sendMessage } from './index';
import twilio from 'twilio';
import * as Sentry from '@sentry/node';



jest.mock('~/utils/prisma', () => ({
    studioAccount: {
        findMany: jest.fn(),
    },
}));

jest.mock('twilio');
jest.mock('@sentry/node');

const mockList = jest.fn();
const mockCreate = jest.fn();

// For tests that call client.messages.list
twilio.mockReturnValue({
    messages: {
        create: mockCreate,
        list: mockList,
    },
});


describe('getTwilioAccount', () => {
    it('returns the Twilio account for a given studio ID', async () => {
        const mockAccount = { id: 1, platform: 'twilio' };
        prisma.studioAccount.findMany.mockResolvedValue([
            { Account: mockAccount },
        ]);

        const account = await getTwilioAccount(1);

        expect(account).toEqual(mockAccount);
        expect(prisma.studioAccount.findMany).toHaveBeenCalledWith({
            where: { studioId: 1 },
            include: { Account: true },
        });
    });
});



describe('getMessagesToContact', () => {
    it('should return messages to contact', async () => {
        const mockMessages = [
            { to: '123', from: '456', body: 'Hello', dateSent: new Date() },
            // add more mock messages as needed
        ];
        mockList.mockResolvedValue(mockMessages);

        const result = await getMessagesToContact(twilio(), '123');
        expect(result).toEqual(mockMessages.map(message => ({
            to: message.to,
            from: message.from,
            body: message.body,
            date: message.dateSent,
            fromStudio: true,
        })));
    });
});

describe('getMessagesFromContact', () => {
    it('should return messages from contact', async () => {
        const mockMessages = [
            { to: '123', from: '456', body: 'Hello', dateSent: new Date() },
            // add more mock messages as needed
        ];
        mockList.mockResolvedValue(mockMessages);

        const result = await getMessagesFromContact(twilio(), '123');
        expect(result).toEqual(mockMessages.map(message => ({
            to: message.to,
            from: message.from,
            body: message.body,
            date: message.dateSent,
            fromStudio: false,
        })));
    });
});


describe('sendMessage', () => {
    it('should send a message', async () => {
        const mockMessage = {
            to: '123',
            from: '456',
            body: 'Hello',
        };
        mockCreate.mockResolvedValue(mockMessage);

        const params = {
            to: '123',
            from: '456',
            message: 'Hello',
            studioId: '1',
        };

        await sendMessage(params);

        expect(mockCreate).toHaveBeenCalledWith(mockMessage);
    });

    it('should throw an error if sending the message fails', async () => {
        const error = new Error('Failed to send message');
        mockCreate.mockRejectedValue(error);

        const params = {
            to: '123',
            from: '456',
            message: 'Hello',
            studioId: '1',
        };

        await expect(sendMessage(params)).rejects.toThrow(error);
        expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
});