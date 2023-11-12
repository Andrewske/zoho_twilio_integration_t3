'use client';
import styles from './page.module.css';
import { getMessages } from '../actions/twilio';
import { useContext, useState, useEffect } from 'react';

import { ZohoContext } from '../providers/ZohoProvider';
import ChatWindow from '../components/ChatWindow';
import { Comment } from 'react-loader-spinner';
import useToast from '~/hooks/useToast';

export default function Home() {
  const { leadPhoneNumber, studio } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null);
  const toast = useToast();
  const { container: ToastContainer } = toast;

  useEffect(() => {
    if (leadPhoneNumber) {
      getMessages({ leadPhoneNumber }).then((messages) => {
        setMessages(messages);
      });
    }
  }, [leadPhoneNumber]);

  useEffect(() => {
    if (!studio?.active) {
      toast.sendError(
        `Hi ${studio?.name}, this feature is currently still in development. Please check back soon!`,
        { autoClose: false }
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
          studioPhoneNumber={studio?.phone}
          messages={messages}
          toast={toast}
        />
      )}
    </main>
  );
}
