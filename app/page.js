'use client';
import styles from './page.module.css';
import { getMessages } from '../actions/twilio';
import { useContext, useState, useEffect } from 'react';

import { ZohoContext } from '../providers/ZohoProvider';
import ChatWindow from '../components/ChatWindow';
import { Comment } from 'react-loader-spinner';
import { sendError } from '~/utils/toast';
import ToastContainer from '~/components/ToastContainer';

export default function Home() {
  const { studio, contact } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null);


  useEffect(() => {
    if (!messages && contact && studio?.id) {
      console.log(JSON.stringify({ contact, studio }))
      getMessages({ contactMobile: contact.Mobile, studioId: studio?.id }).then(
        (messages) => {
          if (messages.length === 0) {
            sendError(
              `There are no messages to or from this lead. Be the first to send one!`
            );
          }
          setMessages(messages);
        }
      );
    }
  }, [contact, studio, messages]);

  useEffect(() => {
    if (studio && !studio?.active) {
      sendError(
        `Hi ${studio?.name}, this feature is currently still in development. Please check back soon!`,
        false
      );
    }
  }, [studio]);

  return (
    <main className={styles.main}>
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
