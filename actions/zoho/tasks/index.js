'use server'
import axios from 'axios';
import { getZohoAccount } from "..";

export const createTaskData = ({ zohoId, message, lead, student }) => {
    const { to, from, msg } = message;
    const { leadId = null, leadName = null } = lead ?? {};
    const { studentId = null, studentName = null } = student ?? {};

    const taskData = {
        Owner: { id: zohoId },
        Status: 'Not Started',
        Send_Notification_Email: false,
        Description: `TO: ${to} FROM: ${from} MSG: ${msg}`,
        Priority: 'Low',
        send_notification: true,
        Subject: 'New SMS Message',
    };

    if (leadId && leadName) {
        taskData['What_Id'] = { id: leadId, name: leadName };
        taskData['$se_module'] = 'Leads';
    }

    if (studentId && studentName) {
        taskData['What_Id'] = { id: studentId, name: studentName };
        taskData['$se_module'] = 'Contacts';
    }

    return taskData;
};

export const postTaskToZoho = async ({ apiDomain, accessToken, taskData }) => {
    const url = `${apiDomain}/crm/v5/Tasks`;
    const headers = {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
    };

    try {
        return await axios.post(url, { data: [taskData] }, { headers }).then((res) => res.data);
    } catch (error) {
        console.error(error);
    }
};

export const createTask = async ({ studioId, zohoId, lead = null, message }) => {
    try {
        const taskData = createTaskData({ zohoId, message, lead });
        const { apiDomain, accessToken } = await getZohoAccount({ studioId });
        await postTaskToZoho({ apiDomain, accessToken, taskData });
        console.info("Task Created Successfully");
    } catch (error) {
        console.error('Error creating task:', error, { studioId, zohoId, lead, message });
    }
};
