'use server';
import { getZohoAccount } from '..';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';
// import { formatMobile } from '~/utils';

export const createTaskData = async ({ zohoId, message, contact }) => {
  const { to, from, msg } = message;
  const se_module = contact.isLead ? 'Leads' : 'Contacts';

  const taskData = {
    Owner: { id: zohoId },
    Status: 'Not Started',
    Description: `TO: ${to} FROM: ${from} MSG: ${msg}`,
    Priority: 'Low',
    Subject: `NEW SMS: From ${contact.isLead ? 'Lead' : 'Student'} - ${contact?.Full_Name
      }`,
  };

  if (se_module === 'Leads') {
    taskData['What_Id'] = { id: contact?.id, name: contact?.Full_Name };
  }
  if (se_module === 'Contacts') {
    taskData['Who_Id'] = { id: contact?.id, name: contact?.Full_Name };
  }
  taskData['$se_module'] = se_module;

  return taskData;
};

export const postTaskToZoho = async ({ apiDomain, accessToken, taskData }) => {
  const url = `${apiDomain}/crm/v5/Tasks`;
  const headers = {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: [taskData] }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error('Zoho task creation failed:', {
        status: response.status,
        statusText: response.statusText,
        errorBody,
      });
      throw new Error(`Error posting task to Zoho: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
    }

    const responseBody = await response.json();
    return responseBody?.data?.[0];
  } catch (error) {
    logError({
      message: 'Error posting task to Zoho',
      error,
      level: 'error',
      data: { taskData },
    });
    throw error;
  }
};

export const createTask = async ({ studioId, zohoId, contact, message }) => {
  // if (formatMobile(contact.Mobile) === process.env.KEVIN_MOBILE) return;
  try {
    const taskData = await createTaskData({ zohoId, message, contact });
    const { apiDomain, accessToken } = await getZohoAccount({ studioId });

    const zohoTaskResponse = await postTaskToZoho({ apiDomain, accessToken, taskData });
    
    return {
      zohoTaskId: zohoTaskResponse?.details?.id,
      taskSubject: taskData.Subject,
      taskStatus: taskData.Status,
      contactId: contact?.id,
    };
  } catch (error) {
    logError({
      message: 'Error creating task:',
      error,
      data: { studioId, zohoId, contactId: contact?.id },
    });
    throw error;
  }
};

export const createUnlinkedTask = async ({ studio, message }) => {
  try {
    const { apiDomain, accessToken } = await getZohoAccount({ studioId: studio.id });
    const phone = message.fromNumber;
    const last4 = phone.slice(-4);

    const taskData = {
      Owner: { id: studio.zohoId },
      Status: 'Not Started',
      Subject: `UNLINKED SMS: Yes reply from ***${last4}`,
      Description: `Phone: ${phone}\nMessage: ${message.message}\nStudio: ${studio.name}\nReceived: ${message.createdAt}`,
      Priority: 'High',
    };

    const zohoResponse = await postTaskToZoho({ apiDomain, accessToken, taskData });

    if (zohoResponse?.details?.id) {
      await prisma.zohoTask.create({
        data: {
          zohoTaskId: zohoResponse.details.id,
          messageId: message.id,
          studioId: studio.id,
          contactId: null,
          taskSubject: taskData.Subject,
          taskStatus: taskData.Status,
        },
      });
    }

    return zohoResponse;
  } catch (error) {
    logError({
      message: 'Error creating unlinked task',
      error,
      level: 'error',
      data: { studioId: studio?.id, messageId: message?.id },
    });
    throw error;
  }
};
