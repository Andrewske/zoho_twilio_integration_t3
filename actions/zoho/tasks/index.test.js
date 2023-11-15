import { createTaskData, postTaskToZoho } from './index';
import axios from 'axios';

jest.mock('axios');

describe('createTaskData', () => {
    it('returns the correct task data', () => {
        const taskData = createTaskData({
            zohoId: '1',
            message: { to: 'to', from: 'from', msg: 'msg' },
            lead: { leadId: '2', leadName: 'Lead' },
        });

        expect(taskData).toEqual({
            Owner: { id: '1' },
            Status: 'Not Started',
            Send_Notification_Email: false,
            Description: 'TO: to FROM: from MSG: msg',
            Priority: 'Low',
            send_notification: true,
            Subject: 'New SMS Message',
            What_Id: { id: '2', name: 'Lead' },
            $se_module: 'Leads',
        });
    });
});

describe('postTaskToZoho', () => {
    it('posts the task data to Zoho', async () => {
        axios.post.mockResolvedValue({ data: 'success' });

        const response = await postTaskToZoho({
            apiDomain: 'https://api.zoho.com',
            accessToken: 'access_token',
            taskData: {},
        });

        expect(axios.post).toHaveBeenCalledWith(
            'https://api.zoho.com/crm/v5/Tasks',
            { data: [{}] },
            { headers: { Authorization: 'Bearer access_token', 'Content-Type': 'application/json' } }
        );
        expect(response).toEqual('success');
    });
});