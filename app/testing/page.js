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


export default function Page() {
    const { studio, contact } = useContext(ZohoContext);
    const [messages, setMessages] = useState(null);

    // useEffect(() => {
    //     revalidatePath('/testing')
    // })


    // const secretPassword = process.env.SECRET_PASSWORD;


    // Existing code

    const handleLookupContactClick = async () => {

        const contact = await lookupContact({ mobile: '5098992771', studioId: "cloj98kgd00092z9whucd9web" })
        console.log({ contact })

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

    const handleSendFollowUpMessage = async () => {
        const contact = await lookupContact({ mobile: '5098992771', studioId: "cloj98kgd00092z9whucd9web" })
        console.log({ contact })
        fetch('/api/twilio/send_follow_up', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contact,
                studioId: "cloj98kgd00092z9whucd9web",
                from: "2813469774",
                to: "5098992771"
            }),
            cache: 'no-cache',
            next: { revalidate: 0 },// *default, no-cache, reload, force-cache, only-if-cached
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

                <button className={styles.button} onClick={() => handleSendWelcomeMessage()}>Send Welcome Message</button>
                <button className={styles.button} onClick={() => handleSendFollowUpMessage()}>Send Follow Up Message</button>
                <button className={styles.button} onClick={() => printDatabaseURL()}>Print DB URL</button>
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

