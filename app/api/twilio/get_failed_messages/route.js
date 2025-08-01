import { readFile } from 'node:fs/promises';
import { logError } from "~/utils/logError";
import { prisma } from '~/utils/prisma';

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (
        process.env.NODE_ENV === 'production' &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return new Response('Unauthorized', {
            status: 401,
        });
    }

    try {
        const messages = await getMissingMessages();

        // await uploadMessagesToZoho(messages)

        return new Response(JSON.stringify(messages), {
            status: 200,
        });

    } catch (error) {
        console.error(error);
        logError({
            message: 'Error in Updating Analytics:',
            error,
            level: 'error',
            data: {},
        });
        return new Response('Error', {
            status: 500,
        });
    }
}





// const getErrorMessages = async () => {
//     // // Get all the messages from Twilio
//     const twilioAccount = await getTwilioAccount(process.env.ADMIN_STUDIO_ID);

//     const client = getTwilioClient(twilioAccount);

//     const messages = await client.messages.list({ limit: 40000, pageSize: 1000 })

//     console.log(messages.length)

//     const failedMessages = messages
//         .filter(message => message.status === 'failed' || message.status === 'undelivered')

//     console.log(failedMessages.length)

//     await writeFile('lib/failed-messages.json', JSON.stringify(failedMessages, null, 2))

//     return failedMessages
// }


const getMissingMessages = async () => {

    const messages = await readFile('lib/failed-messages.json', 'utf8')
        .then(data => JSON.parse(data))
        .then(data => data.map(message => {
            return {
                message: message.body,
                fromNumber: message.from,
                toNumber: message.to,
                createdAt: message.dateCreated,
                twilioMessageId: message.sid,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                status: 'failed',
            }
        }))

    console.log('messages', messages.length)

    const twilioErrors = await readFile('lib/twilio-error-codes.json', 'utf8')
        .then(data => JSON.parse(data))
        .then(data => data.map(error => {
            return {
                errorCode: error.code,
                errorMessage: error.message + ' ' + error.secondary_message,
            }
        }))

    console.log('twilioErrors', twilioErrors.length)

    const messagesWithErrors = messages.map(message => {
        const error = twilioErrors.find(error => error.errorCode === message.errorCode)
        return {
            ...message,
            errorMessage: error?.errorMessage,
        }
    })

    console.log('messagesWithErrors', messagesWithErrors.length)

    console.log(messagesWithErrors[0])


    try {
        // First, find which messages actually exist in our database
        const existingMessages = await prisma.message.findMany({
            where: {
                twilioMessageId: {
                    in: messagesWithErrors.map(m => m.twilioMessageId)
                }
            },
            select: {
                twilioMessageId: true
            }
        });

        console.log('existingMessages', existingMessages.length)

        const existingTwilioIds = new Set(existingMessages.map(m => m.twilioMessageId));

        // // Filter to only update messages that exist in our database
        // const messagesToUpdate = messagesWithErrors.filter(m =>
        //     existingTwilioIds.has(m.twilioMessageId)
        // );

        // console.log('messagesToUpdate', messagesToUpdate.length)

        // await updateMessages(messagesToUpdate)

        // return messagesToUpdate

        const missingMessages = messagesWithErrors.filter(m => !existingTwilioIds.has(m.twilioMessageId))

        console.log('missingMessages', missingMessages.length)

        await createMissingMessages(missingMessages)
        // await writeFile('lib/missing-messages.json', JSON.stringify(missingMessages, null, 2))

        // console.log(`Found ${messagesToUpdate.length} out of ${messagesWithErrors.length} messages to update`);


    } catch (error) {
        // console.error(error)
    }

    return {}
}



// const updateMessages = async (messages) => {
//     try {
//         await Promise.all(messages.map(messageWithError =>
//             prisma.message.update({
//                 where: {
//                     twilioMessageId: messageWithError.twilioMessageId
//                 },
//                 data: {
//                     status: 'failed',
//                     errorCode: messageWithError.errorCode,
//                     errorMessage: messageWithError.errorMessage,
//                 }
//             })
//         ))
//     } catch (error) {
//         console.error(error)
//     }
// }


const createMissingMessages = async (messages) => {
    await prisma.message.createMany({
        data: messages
    })
}
