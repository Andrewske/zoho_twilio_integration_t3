import prisma from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
import { logError } from '~/utils/logError';


const sendFollowUpMessage = async ({ contact, from, to, studioId }) => {
    const followUpMessage =
        'Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?';

    let message = findOrCreateMessage({ contact, from, to, studioId });

    try {
        const { twilioMessageId } = await sendMessage({
            to,
            from,
            message: followUpMessage,
            studioId,
            contact,
        });

        if (twilioMessageId) {
            await prisma.Message.update({
                where: {
                    id: message?.id,
                },
                data: {
                    twilioMessageId,
                }
            })
        }
    } catch (error) {
        logError({
            message: 'Error sending follow up message:',
            error,
            level: 'warning',
            data: { contactId: contact?.id, from, to, studioId },
        });
    }
}

export default sendFollowUpMessage;



const findOrCreateMessage = async ({ contact, from, to, studioId }) => {
    // Look up the record
    let message = await prisma.message.findFirst({
        where: {
            to,
            isFollowUpMessage: true,
        },
        select: {
            id: true,
            twilioMessageId: true,
        }
    });

    if (message?.twilioMessageId) {
        console.log('Follow up message already sent')
        return;
    }

    // If the record doesn't exist, create it
    if (!message) {
        message = await prisma.message.create({
            data: {
                contactId: contact?.id,
                studioId: studioId,
                from,
                to,
                isFollowUpMessage: true,
            },
        });
    }
    return message;
}