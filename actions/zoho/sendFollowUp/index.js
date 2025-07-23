import { sendMessage } from '~/actions/twilio';
import { formatMobile } from '~/utils';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';
import { updateStatus } from '../contact/updateStatus';
import { createTask } from '../tasks';


const followUpMessage =
    'Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?';

const followUpMessageSouthlake = 'Great! We have a limited number spots for new clients each week. What day of the week Monday to Saturday works best for you?';

// Checks if there is a contact
// If there is not a contact, we create a message that will be picked up by the cron job
// If there is a contact, we check if the contact has already received a follow up message
// If the contact has not received a follow up message and the contact is a lead, we send a follow up message
// Then update the contact's status to 'Contacted - Not Booked'
export async function sendFollowUp({ contact = null, studio = null, from = null, to = null, msg = null }) {
    try {
        // returns a message if it exists, otherwise creates a new messag
        const message = await findOrCreateMessage({ contact, studio, to, from });

        if (!message) {
            return;
        }

        const taskData = await createTask({
            studioId: studio?.id,
            zohoId: studio?.zohoId,
            contact,
            message: { to, from, msg },
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

        const response = await sendMessage({
            to,
            from,
            message: southLake ? followUpMessageSouthlake : followUpMessage,
            studioId: studio.id,
            contact,
            messageId: message.id,
        });


        const updatedMessage = await prisma.message.update({
            where: {
                id: message.id,
            },
            data: {
                studioId: studio.id,
                contactId: contact?.id,
                twilioMessageId: response.twilioMessageId,
                message: southLake ? followUpMessageSouthlake : followUpMessage,
            },
        });

        if (!updatedMessage) {
            throw new Error('send_follow_up could not update message');
        }

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
    } catch (error) {
        return false
    }
}

const findOrCreateMessage = async ({ contact, studio, from, to }) => {
    // Otherwise, we check if the contact has already received a follow up message
    const message = await prisma.message.findFirst({
        where: {
            twilioMessageId: {
                equals: null
            },
            toNumber: to,
            isFollowUpMessage: true,
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    if (!message) {
        if (!contact) {
            console.log('creating no contact follow up message')
            await prisma.message.create({
                data: {
                    contactId: null,
                    studioId: null,
                    fromNumber: formatMobile(from),
                    toNumber: formatMobile(to),
                    isFollowUpMessage: true,
                },
            });
            return null;
        }
        if (contactIsLead(contact)) {
            console.log('creating lead follow up message')
            return await prisma.message.create({
                data: {
                    contactId: contact?.id,
                    studioId: studio?.id,
                    fromNumber: formatMobile(studio.smsPhone),
                    toNumber: formatMobile(contact.Mobile),
                    isFollowUpMessage: true,
                },
            });
        }
    }
    return message;

}
