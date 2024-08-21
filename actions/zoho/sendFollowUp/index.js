import { prisma } from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
import { logError } from '~/utils/logError';
import { updateStatus } from '../contact/updateStatus';


const followUpMessage =
    'Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?';

// Checks if there is a contact
// If there is not a contact, we create a message that will be picked up by the cron job
// If there is a contact, we check if the contact has already received a follow up message
// If the contact has not received a follow up message and the contact is a lead, we send a follow up message
// Then update the contact's status to 'Contacted, Not Booked'
export async function sendFollowUp({ contact = null, studio = null, from = null, to = null }) {

    try {
        // returns a message if it exists, otherwise creates a new messag
        const message = await findOrCreateMessage({ contact, studio, to, from });

        if (!message) {
            return;
        }

        // We need to create a task if there is already a follow up message or if the contact is not a lead
        if (!contactIsLead(contact)) {
            return;
        }

        const response = await sendMessage({
            to,
            from,
            message: followUpMessage,
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
            },
        });

        if (!updatedMessage) {
            throw new Error('send_follow_up could not update message');
        }

        await updateStatus({ studio, contact });

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
            toNumber: contact?.Mobile ?? to,
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
                    fromNumber: from,
                    toNumber: to,
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
                    fromNumber: studio.smsPhone,
                    toNumber: contact.Mobile,
                    isFollowUpMessage: true,
                },
            });
        }
    }
    return message;

}
