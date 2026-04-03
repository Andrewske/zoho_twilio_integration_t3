import { createTaskData, postTaskToZoho } from './index';

jest.mock('~/utils/logError', () => ({ logError: jest.fn() }));
jest.mock('~/actions/zoho', () => ({ getZohoAccount: jest.fn() }));

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
