import { lookupLead } from './index';
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

describe('lookupLead', () => {
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
  it('returns the lead data if it exists', async () => {
    const leadData = { id: 1, Full_Name: 'Lead' };
    await axios.get.mockResolvedValue({ data: { data: [leadData] } });
    getStudioAccounts.mockResolvedValue([
      { Account: { platform: 'zoho', accessToken: 'access_token' } },
    ]);
    getZohoAccountFromAccounts.mockReturnValue({
      Account: { platform: 'zoho', accessToken: 'access_token' },
    });
    const result = await lookupLead({
      from: '1234567890',
      studioId: 'studioId',
    });
    expect(result).toEqual({ leadId: 1, leadName: 'Lead' });
  });

  it('returns null if the lead data does not exist', async () => {
    await axios.get.mockResolvedValue({ data: [] });
    getStudioAccounts.mockResolvedValue([
      { Account: { platform: 'zoho', accessToken: 'access_token' } },
    ]);
    getZohoAccountFromAccounts.mockReturnValue({
      Account: { platform: 'zoho', accessToken: 'access_token' },
    });
    const result = await lookupLead({
      from: '1234567890',
      studioId: 'studioId',
    });
    expect(result).toEqual({ leadId: null, leadName: null });
  });
});
