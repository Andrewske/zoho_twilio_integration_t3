import { createTaskData, postTaskToZoho, createTask } from './index';

jest.mock('~/utils/logError', () => ({ logError: jest.fn() }));
jest.mock('~/actions/zoho', () => ({ getZohoAccount: jest.fn() }));

import { getZohoAccount } from '~/actions/zoho';

describe('createTaskData', () => {
    it('returns the correct task data for a lead', async () => {
        const contact = { id: '2', Full_Name: 'Lead Name', isLead: true };
        const taskData = await createTaskData({
            zohoId: '1',
            message: { to: 'to', from: 'from', msg: 'msg' },
            contact,
        });

        expect(taskData).toEqual({
            Owner: { id: '1' },
            Status: 'Not Started',
            Description: 'TO: to FROM: from MSG: msg',
            Priority: 'Low',
            Subject: 'NEW SMS: From Lead - Lead Name',
            What_Id: { id: '2', name: 'Lead Name' },
            $se_module: 'Leads',
        });
    });

    it('returns the correct task data for a contact', async () => {
        const contact = { id: '3', Full_Name: 'Student Name', isLead: false };
        const taskData = await createTaskData({
            zohoId: '1',
            message: { to: 'to', from: 'from', msg: 'msg' },
            contact,
        });

        expect(taskData).toMatchObject({
            $se_module: 'Contacts',
            Who_Id: { id: '3', name: 'Student Name' },
        });
    });
});

describe('createTask account selection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ data: [{ details: { id: 'new-task-id' } }] }),
        });
    });

    it('uses studioId for the API call by default', async () => {
        getZohoAccount.mockResolvedValue({ apiDomain: 'https://api.zoho.com', accessToken: 'studio-token' });

        await createTask({
            studioId: 'colleyville',
            zohoId: 'colleyville-user',
            contact: { id: 'lead-1', Full_Name: 'X', isLead: true },
            message: { to: 't', from: 'f', msg: 'm' },
        });

        expect(getZohoAccount).toHaveBeenCalledWith({ studioId: 'colleyville' });
    });

    it('uses apiAccountStudioId for the API call when provided (admin override)', async () => {
        getZohoAccount.mockResolvedValue({ apiDomain: 'https://api.zoho.com', accessToken: 'admin-token' });

        await createTask({
            studioId: 'colleyville',           // task is OWNED by Colleyville
            zohoId: 'colleyville-user',
            contact: { id: 'lead-1', Full_Name: 'X', isLead: true },
            message: { to: 't', from: 'f', msg: 'm' },
            apiAccountStudioId: 'southlake_admin', // but POSTed via admin's account
        });

        expect(getZohoAccount).toHaveBeenCalledWith({ studioId: 'southlake_admin' });
    });
});

describe('postTaskToZoho', () => {
    it('posts the task data to Zoho', async () => {
        const mockTaskResponse = { data: [{ details: { id: 'task-id' } }] };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockTaskResponse),
        });

        const response = await postTaskToZoho({
            apiDomain: 'https://api.zoho.com',
            accessToken: 'access_token',
            taskData: {},
        });

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.zoho.com/crm/v5/Tasks',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Zoho-oauthtoken access_token',
                }),
                body: JSON.stringify({ data: [{}] }),
            })
        );
        expect(response).toEqual(mockTaskResponse.data[0]);
    });
});
