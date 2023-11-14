'use client';
import styles from './page.module.css';
import { getMessages } from '../actions/twilio';
import { useContext, useState, useEffect } from 'react';

import { ZohoContext } from '../providers/ZohoProvider';
import ChatWindow from '../components/ChatWindow';
import { Comment } from 'react-loader-spinner';
import useToast from '~/hooks/useToast';
import ToastContainer from '~/components/ToastContainer';

export default function Home() {
  const { leadPhoneNumber, studio } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (!messages && leadPhoneNumber && studio?.id) {
      getMessages({ leadPhoneNumber, studioId: studio?.id }).then(
        (messages) => {
          if (messages.length === 0) {
            toast.sendError(
              `There are no messages to or from this lead. Be the first to send one!`
            );
          }
          setMessages(messages);
        }
      );
    }
  }, [leadPhoneNumber, studio, toast, messages]);

  useEffect(() => {
    if (!studio?.active) {
      toast.sendError(
        `Hi ${studio?.name}, this feature is currently still in development. Please check back soon!`,
        false
      );
    }
  }, [studio, toast]);

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
          leadPhoneNumber={leadPhoneNumber}
          studio={studio}
          messages={messages}
          toast={toast}
        />
      )}
    </main>
  );
}
