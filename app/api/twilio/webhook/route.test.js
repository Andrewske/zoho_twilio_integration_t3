import { POST, parseRequest, isValidMessage, getStudioInfo } from './route.js'; // Adjust the import based on your file structure
import prisma from '~/utils/prisma.js';
import { lookupLead } from '~/actions/zoho/leads/index.js';
import { createTask } from '~/actions/zoho/tasks/index.js';

// Mock external modules
jest.mock('~/utils/prisma.js', () => ({
    studio: {
        findFirst: jest.fn(),
    },
}));

jest.mock('~/actions/zoho/leads/index.js', () => ({
    lookupLead: jest.fn(),
}))

jest.mock('~/actions/zoho/tasks/index.js', () => ({
    createTask: jest.fn(),
}))

global.Response = function (body, init) {
    return {
        body: body,
        status: init?.status
    };
};
// jest.mock('other-module', () => /* Mock implementation */);

describe('POST function', () => {
    let consoleLog;
    let consoleError;

    beforeEach(() => {
        consoleLog = console.log;
        consoleError = console.error;
        console.log = jest.fn();
        console.error = jest.fn();
    });

    afterEach(() => {
        console.log = consoleLog;
        console.error = consoleError;
    });

    it('should process valid requests successfully', async () => {
        // Mock a valid request
        const mockRequest = {
            text: jest.fn().mockResolvedValue('To=%2B123456789&From=%2B987654321&Body=Hello%21')
        };

        // Mock responses for database calls and other functions
        prisma.studio.findFirst.mockResolvedValue({ id: 'studio-id', zohoId: 'zoho-id' });
        lookupLead.mockResolvedValue('lead-id');
        createTask.mockResolvedValue('task-id');

        const response = await POST(mockRequest);

        // Assertions to check if the correct functions were called and the response is as expected
        expect(response).toEqual(new Response(null, { status: 200 }));
    });

    it('should handle invalid requests', async () => {
        // Mock an invalid request (e.g., missing required fields)
        const mockRequest = {
            text: jest.fn().mockResolvedValue('From=%2B987654321&Body=Hello%21') // Missing 'To'
        };

        const response = await POST(mockRequest);

        // Assertions to check the response for an invalid request
        expect(response).toEqual(new Response(null, { status: 200 }))
    });

    // More tests for error scenarios and other edge cases
});


describe('parseRequest function', () => {
    it('should parse URL-encoded form data correctly', async () => {
        // URL-encoded form data
        const mockBody = 'To=%2B123456789&From=%2B987654321&Body=Hello%21';
        const mockRequest = {
            text: jest.fn().mockResolvedValue(mockBody)
        };

        // Expected result after parsing URL-encoded form data
        const expectedResult = {
            To: '+123456789',
            From: '+987654321',
            Body: 'Hello!'
        };
        const result = await parseRequest(mockRequest);

        expect(mockRequest.text).toHaveBeenCalled();
        expect(result).toEqual(expectedResult);
    });

    it('should handle non-query-string input gracefully', async () => {
        const mockRequest = {
            text: jest.fn().mockResolvedValue('invalid query string')
        };

        const result = await parseRequest(mockRequest);
        expect(result).toEqual({ 'invalid query string': '' });
    });
});


describe('isValidMessage function', () => {
    it('should return true for a valid message', async () => {
        const validMessage = {
            to: '123456789',
            from: '987654321',
            msg: 'Hello!'
        };
        expect(await isValidMessage(validMessage)).toBe(true);
    });

    it('should return false if "to" is missing', async () => {
        const messageWithoutTo = {
            from: '987654321',
            msg: 'Hello!'
        };
        expect(await isValidMessage(messageWithoutTo)).toBe(false);
    });

    it('should return false if "from" is missing', async () => {
        const messageWithoutFrom = {
            to: '123456789',
            msg: 'Hello!'
        };
        expect(await isValidMessage(messageWithoutFrom)).toBe(false);
    });

    it('should return false if "msg" is missing', async () => {
        const messageWithoutMsg = {
            to: '123456789',
            from: '987654321'
        };
        expect(await isValidMessage(messageWithoutMsg)).toBe(false);
    });

    it('should return false for an empty message object', async () => {
        const emptyMessage = {};
        expect(await isValidMessage(emptyMessage)).toBe(false);
    });
});

describe('getStudioInfo function', () => {
    let consoleLog;
    let consoleError;

    beforeEach(() => {
        consoleLog = console.log;
        consoleError = console.error;
        console.log = jest.fn();
        console.error = jest.fn();
    });

    afterEach(() => {
        console.log = consoleLog;
        console.error = consoleError;
    });


    it('should retrieve studio info successfully', async () => {
        // Mock prisma response for success scenario
        prisma.studio.findFirst.mockResolvedValue({
            id: 'some-id',
            zohoId: 'some-zohoId',
        });

        const studioInfo = await getStudioInfo('+123456789');
        expect(prisma.studio.findFirst).toHaveBeenCalledWith({
            where: { phone: '23456789' },
            select: { id: true, zohoId: true },
        });
        expect(studioInfo).toEqual({
            id: 'some-id',
            zohoId: 'some-zohoId',
        });
    });

    it('should return null when no studio info is found', async () => {
        // Mock prisma response for no result scenario
        prisma.studio.findFirst.mockResolvedValue(null);

        const studioInfo = await getStudioInfo('+123456789');
        expect(prisma.studio.findFirst).toHaveBeenCalledWith({
            where: { phone: '23456789' },
            select: { id: true, zohoId: true },
        });
        expect(studioInfo).toBeNull();
    });
});