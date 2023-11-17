import { lookupStudent } from './index';
import axios from 'axios';
import {
    getStudioAccounts,
    getZohoAccountFromAccounts,
} from '../account/index';

jest.mock('axios');
jest.mock('../account/index', () => ({
    getStudioAccounts: jest.fn(),
    getZohoAccountFromAccounts: jest.fn(),
}));

describe('lookupStudent', () => {
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
    it('returns the student data if it exists', async () => {
        const studentData = { id: 1, Full_Name: 'Student' };
        await axios.get.mockResolvedValue({ data: { data: [studentData] } });
        getStudioAccounts.mockResolvedValue([
            { Account: { platform: 'zoho', accessToken: 'access_token' } },
        ]);
        getZohoAccountFromAccounts.mockReturnValue({
            Account: { platform: 'zoho', accessToken: 'access_token' },
        });
        const result = await lookupStudent({
            from: '1234567890',
            studioId: 'studioId',
        });
        expect(result).toEqual({ studentId: 1, studentName: 'Student' });
    });

    it('returns null if the student data does not exist', async () => {
        await axios.get.mockResolvedValue({ data: [] });
        getStudioAccounts.mockResolvedValue([
            { Account: { platform: 'zoho', accessToken: 'access_token' } },
        ]);
        getZohoAccountFromAccounts.mockReturnValue({
            Account: { platform: 'zoho', accessToken: 'access_token' },
        });
        const result = await lookupStudent({
            from: '1234567890',
            studioId: 'studioId',
        });
        expect(result).toEqual({ studentId: null, studentName: null });
    });
});