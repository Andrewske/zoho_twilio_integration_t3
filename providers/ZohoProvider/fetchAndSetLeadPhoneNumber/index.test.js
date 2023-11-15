
import { fetchAndSetLeadPhoneNumber } from './index'; // Adjust the import path as necessary


import { getZohoRecord } from '~/utils/zohoApi';
import { sendError } from '~/utils/toast';

jest.mock('~/utils/zohoApi');

jest.mock('~/actions/twilio', () => ({
    getMessages: jest.fn(),
}));

jest.mock('~/utils/zohoApi', () => ({
    getZohoRecord: jest.fn(),
}))
jest.mock('~/utils/toast', () => ({
    sendError: jest.fn(),
    sendSuccess: jest.fn(),
}))
jest.mock('~/actions/zoho/studio', () => ({
    getStudioData: jest.fn(),
}))

describe('fetchAndSetLeadPhoneNumber', () => {
    const setLeadPhoneNumber = jest.fn();

    let consoleError;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleError = console.error;
        console.error = jest.fn();
    });

    afterEach(() => {
        console.error = consoleError;
    });

    it('should set the lead phone number if it exists', async () => {
        const response = {
            data: [
                {
                    Phone: '+1234567890',
                    Mobile: '+1987654321',
                },
            ],
        };
        getZohoRecord.mockResolvedValueOnce(response);

        await fetchAndSetLeadPhoneNumber({
            entity: 'Leads',
            entityId: '123',
            setLeadPhoneNumber,
        });

        expect(setLeadPhoneNumber).toHaveBeenCalledWith('987654321');
    });


    it('should set the lead phone number to the phone number if it exists and mobile number does not', async () => {
        const response = {
            data: [
                {
                    Phone: '+1234567890',
                },
            ],
        };
        getZohoRecord.mockResolvedValueOnce(response);

        await fetchAndSetLeadPhoneNumber({
            entity: 'Leads',
            entityId: '123',
            setLeadPhoneNumber,
        });

        expect(setLeadPhoneNumber).toHaveBeenCalledWith('234567890');
    });

    it('should send an error message if no phone number is found', async () => {
        const response = {
            data: [
                {
                    Name: 'John Doe',
                },
            ],
        };

        getZohoRecord.mockResolvedValueOnce(response);


        await fetchAndSetLeadPhoneNumber({
            entity: 'Leads',
            entityId: '123',
            setLeadPhoneNumber,
        });

        expect(setLeadPhoneNumber).not.toHaveBeenCalled();
        expect(sendError).toHaveBeenCalledWith(
            'No phone number found. Please make sure there is a valid number for this lead',
            false
        );
    });

    it('should send an error message if an error occurs while fetching the lead', async () => {
        const consoleError = console.error;
        console.error = jest.fn()

        getZohoRecord.mockRejectedValueOnce(new Error('Network error'));

        await fetchAndSetLeadPhoneNumber({
            entity: 'Leads',
            entityId: '123',
            setLeadPhoneNumber,
        });

        expect(setLeadPhoneNumber).not.toHaveBeenCalled();
        expect(sendError).toHaveBeenCalledWith(
            "An error occurred while fetching the lead's phone number. Please try again.",
            false
        );

        console.error = consoleError;
    });
});