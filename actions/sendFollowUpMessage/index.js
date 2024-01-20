import prisma from '~/utils/prisma';
import { sendMessage } from '~/actions/twilio';
import { logError } from '~/utils/logError';


const sendFollowUpMessage = async ({ contact, from, to, studioInfo }) => {
    try {
        const contactZohoRecord = await prisma.zohoWebhook.findFirst({
            where: {
                contactId: contact.id,
                sentWelcomeMessage: true,
                sentFollowUpMessage: false,
            },
        });

        if (contactZohoRecord) {
            const followUpMessage =
                'Great! We have a limited number spots for new clients each week. What day of the week Monday to Friday works best for you?';
            const { twilioMessageId } = await sendMessage({
                to,
                from,
                message: followUpMessage,
                studioId: studioInfo?.id,
                contact,
            });



            if (twilioMessageId) {
                await prisma.zohoWebhook.update({
                    where: { id: contactZohoRecord.id },
                    data: { sentFollowUpMessage: true, contactId: contact?.id, twilioMessageId },
                });
            }

        } else {
            console.log('already sent follow up message');
        }
    } catch (error) {
        logError({
            message: 'Error sending follow up message:',
            error,
            level: 'warning',
            data: { contactId: contact?.id, from, to, studioId: studioInfo?.zohoId },
        });
    }
}

export default sendFollowUpMessage;