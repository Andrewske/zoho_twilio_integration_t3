'use server'
import axios from 'axios';
import { getZohoAccount } from "..";

export const createTaskData = ({ zohoId, message, contact }) => {
    const { to, from, msg } = message;
    const se_module = contact.isLead ? 'Leads' : 'Contacts';

    const taskData = {
        Owner: { id: zohoId },
        Status: 'Not Started',
        Description: `TO: ${to} FROM: ${from} MSG: ${msg}`,
        Priority: 'Low',
        Subject: `NEW SMS: From ${contact.isLead ? 'Lead' : 'Student'} - ${contact.Full_Name}`
    };


    taskData['What_Id'] = { id: contact.id, name: contact.Full_Name };
    taskData["$se_module"] = se_module;

    return taskData;
};

export const postTaskToZoho = async ({ apiDomain, accessToken, taskData }) => {
    const url = `${apiDomain}/crm/v5/Tasks`;
    const headers = {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
    };

    try {
        const response = await axios.post(url, { data: [taskData] }, { headers });

        if (response.status >= 300) {
            console.error('Error posting task to Zoho:', response);
            throw new Error(`Request failed with status code ${response.status}`);
        }


        return response?.data?.data?.[0];
    } catch (error) {
        console.error('Error posting task to Zoho:', error?.response);
        throw error;
    }
};

export const createTask = async ({ studioId, zohoId, contact, message }) => {
    try {
        const taskData = createTaskData({ zohoId, message, contact });
        console.log('taskData', taskData)
        const { apiDomain, accessToken } = await getZohoAccount({ studioId });

        await postTaskToZoho({ apiDomain, accessToken, taskData });
    } catch (error) {
        console.error('Error creating task:', error.message, { studioId, zohoId, contact, message });
    }
};
