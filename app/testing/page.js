'use client';
import styles from './styles.module.css'

// import { getMessages } from '~/actions/twilio';
import { useContext, useState } from 'react';
import { ZohoContext } from '~/providers/ZohoProvider';
import ChatWindow from '~/components/ChatWindow';
import { Comment } from 'react-loader-spinner';
// import { sendError } from '~/utils/toast';
import ToastContainer from '~/components/ToastContainer';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { printDatabaseURL } from '~/actions/testing_server';
import { createTask } from '~/actions/zoho/tasks';


export default function Page() {
    const { studio, contact } = useContext(ZohoContext);
    const [messages, setMessages] = useState(null);

    // useEffect(() => {
    //     revalidatePath('/testing')
    // })


    // const secretPassword = process.env.SECRET_PASSWORD;


    // Existing code

    const handleLookupContactClick = async () => {
        const contact = await lookupContact({ mobile: '7703145316', studioId: "cloj98kgd00092z9whucd9web" })
        console.log({ contact })

    }

    const handleCreateTask = async () => {
        await createTask({
            studioId: "cloj98kg600072z9wh3xer6yz",
            zohoId: '5114699000000445008',
            contact: {
                isLead: false,
                Full_Name: "rebecca rodriguez",
                id: "5114699000074859039"
            },
            message: {
                to: '2109728592',
                from: '2104528489',
                msg: "hi there! is there any way to reschedule the lesson we have for tonight? we're vinny and rebecca- i believe it's at 0715",
            }
        });
    }

    const handleSendWelcomeMessage = async () => {
        const body = new URLSearchParams({
            leadId: '1234567890',
            ownerId: '5114699000015859001',
            mobile: '5098992771',
            firstName: 'Test',
        });
        const response = await fetch('/api/zoho/send_welcome', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });
        console.log(response)
    }

    const handleHitWebhook = async () => {
        console.log('hit webhook')
        const body = new URLSearchParams({
            To: '3466161442',
            From: '5098992771',
            Body: 'Yes',
            MessageSid: 'SM456729',
        })

        fetch('/api/twilio/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Cache-Control': 'no-store'
            },
            body,
            cache: 'no-store',
            next: { revalidate: 0 },
            // next: { revalidate: 'no-cache' },// *default, no-cache, reload, force-cache, only-if-cached
        })
    }

    const handleCronJob = async () => {
        console.log('hit cron job')

        fetch('/api/cron', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Cache-Control': 'no-store'
            },
            cache: 'no-store',
            next: { revalidate: 0 },
        })
    }

    // if (!secretPassword) {
    //     return (
    //         <div className={styles.wrapper}>
    //             <input type="password" placeholder="Enter secret password" />
    //             <button>Submit</button>
    //         </div>
    //     );
    // }

    return (
        <main className={styles.wrapper}>
            <div className={styles.buttonsContainer}>
                <button className={styles.button} onClick={() => handleLookupContactClick()}>Lookup Contact</button>
                <button className={styles.button} onClick={() => handleCreateTask()}>Create Task</button>
                <button className={styles.button} onClick={() => handleSendWelcomeMessage()}>Send Welcome Message</button>
                <button className={styles.button} onClick={() => printDatabaseURL()}>Print DB URL</button>
                <button className={styles.button} onClick={() => handleHitWebhook()}>Hit Webhook</button>
                <button className={styles.button} onClick={() => handleCronJob()}>CronJob</button>
            </div>
            <ToastContainer />
            {!messages || !studio?.active ? (
                <Comment
                    visible={true}
                    height="80"
                    width="80"
                    ariaLabel="comment-loading"
                    wrapperStyle={{}}
                    wrapperClass="comment-wrapper"
                    color="#fff"
                    backgroundColor="#F4442E"
                />
            ) : (
                <ChatWindow
                    contact={contact}
                    studio={studio}
                    messages={messages}
                    setMessages={setMessages}
                />
            )}
        </main>
    );
}

