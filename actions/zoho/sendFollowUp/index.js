'use server';
import { sendMessage } from '~/actions/twilio';
import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';
import { updateStatus } from '../contact/updateStatus';
import { createTask } from '../tasks';


const followUpMessage =
    'Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?';

const followUpMessageRichmond = 'Great! We have a limited number spots for new clients each week. What day of the week Tuesday to Saturday works best for you?';

const followUpMessageSouthlake = 'Great! We have a limited number spots for new clients each week. What day of the week Monday to Saturday works best for you?';

// Checks if there is a contact
// If there is not a contact, we create a message that will be picked up by the cron job
// If there is a contact, we check if the contact has already received a follow up message
// If the contact has not received a follow up message and the contact is a lead, we send a follow up message
// Then update the contact's status to 'Contacted - Not Booked'
export async function sendFollowUp({ contact = null, studio = null, from = null, to = null, msg = null, messageId = null }) {
    try {
        // Determine what actions to take
        const shouldSendFollowUp = contact && contactIsLead(contact);
        const shouldCreateTask = !!contact; // Always create task if we have a contact

        // FIX #3: Always create task when we have a contact, even if follow-up won't be sent
        // This prevents lost leads when status was changed before customer replied
        if (shouldCreateTask && !shouldSendFollowUp) {
            console.log(`Creating task without follow-up: contact is ${contact?.isLead ? 'lead' : 'contact'} with status ${contact?.Lead_Status}`);

            const taskData = await createTask({
                studioId: studio?.id,
                zohoId: studio?.zohoId,
                contact,
                message: { from: to, to: from, msg },
            });

            if (taskData?.zohoTaskId) {
                await prisma.zohoTask.create({
                    data: {
                        zohoTaskId: taskData.zohoTaskId,
                        messageId,
                        studioId: studio?.id,
                        contactId: taskData.contactId,
                        taskSubject: taskData.taskSubject,
                        taskStatus: taskData.taskStatus,
                    },
                });
            }
            return;
        }

        // If no contact, create placeholder for cron job
        if (!contact) {
            console.log('No contact - creating placeholder for cron job');
            await prisma.message.create({
                data: {
                    contactId: null,
                    studioId: null,
                    fromNumber: formatMobile(from),
                    toNumber: formatMobile(to),
                    isFollowUpMessage: true,
                },
            });
            return;
        }

        // Contact is a new lead - proceed with follow-up
        // First check if there's an existing unsent follow-up (from cron retry)
        let message = await prisma.message.findFirst({
            where: {
                twilioMessageId: { equals: null },
                toNumber: formatMobile(to),
                isFollowUpMessage: true,
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!message) {
            message = await prisma.message.create({
                data: {
                    contactId: contact?.id,
                    studioId: studio?.id,
                    fromNumber: formatMobile(studio.smsPhone),
                    toNumber: formatMobile(contact.Mobile),
                    isFollowUpMessage: true,
                },
            });
        }

        const taskData = await createTask({
            studioId: studio?.id,
            zohoId: studio?.zohoId,
            contact,
            message: { from: to, to: from, msg },
        });

        if (taskData?.zohoTaskId) {
            await prisma.zohoTask.create({
                data: {
                    zohoTaskId: taskData.zohoTaskId,
                    messageId: message.id,
                    studioId: studio?.id,
                    contactId: taskData.contactId,
                    taskSubject: taskData.taskSubject,
                    taskStatus: taskData.taskStatus,
                },
            });
        }

        const southLake = await studioIsSouthlake(from);
        const richmond = studioIsRichmond(contact.Owner);

        await sendMessage({
            to,
            from,
            message: southLake ? followUpMessageSouthlake : richmond ? followUpMessageRichmond : followUpMessage,
            studioId: studio.id,
            contact,
            messageId: message.id,
        });

        if (!southLake) {
            await updateStatus({ studio, contact });
        }

        return;

    } catch (error) {
        logError({
            error,
            message: 'Error in sendFollowUp',
            level: 'error',
            data: { contact, studio, message: error.message },
        });
        throw error;
    }
}

const studioIsRichmond = (studio) => {
    return studio?.name === 'Richmond FADS';
}

const studioIsSouthlake = async (from) => {
    const studio = await prisma.studio.findFirst({
        where: {
            smsPhone: formatMobile(from),
        },
    });

    return studio?.name === 'Southlake';
}
const contactIsLead = (contact) => {
    try {
        return contact?.isLead && contact?.Lead_Status == 'New';
    } catch (_error) {
        return false
    }
}
