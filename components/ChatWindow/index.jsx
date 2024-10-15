'use client';
import styles from './styles.module.css';
import { useEffect } from 'react';

import { sendError } from '~/utils/toast';

import MessageForm from '../MessageForm';
import MessageList from '../MessageList';

const ChatWindow = ({ contact, studio, messages, setMessages }) => {
  useEffect(() => {
    if (studio && !studio?.active) {
      sendError(
        `Hi ${studio?.name}, this feature is currently still in development. Please check back soon!`,
        false
      );
    }
  }, [studio]);

  return (
    <div className={styles.wrapper}>
      <div></div>
      <MessageList
        messages={messages}
        contactName={contact.Full_Name}
        studio={studio}
      />
      <MessageForm
        contact={contact}
        studio={studio}
        setMessages={setMessages}
      />
    </div>
  );
};

export default ChatWindow;
