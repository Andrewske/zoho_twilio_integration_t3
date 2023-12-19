'use client';
import { useState } from 'react';
import styles from './styles.module.css';
import { getMessages, sendMessage } from '~/actions/twilio';
import * as Sentry from '@sentry/react';
import { sendError, sendSuccess } from '~/utils/toast';

const MessageForm = ({ contact, studio, setMessages }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleNewMessage = (event) => {
    setNewMessage(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!studio) {
      sendError(`We can't find which studio you are. Please refresh the page`, {
        autoClose: false,
      });
      return;
    }

    setIsSending(true);

    const body = {
      message: newMessage,
      to: contact.Mobile,
      from: studio?.smsPhone,
      studioId: studio?.id,
      contactId: contact.id,
    };

    try {
      await sendMessage(body);
      setNewMessage('');
      sendSuccess('Message sent!');

      const messages = await getMessages({
        contactMobile: contact.Mobile,
        studioId: studio?.id,
      });

      if (messages.length > 0) {
        setMessages(messages);
      }
    } catch (error) {
      sendError('Error sending the message! Try refreshing the page.');
      Sentry.captureException(error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      handleSubmit(event);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.wrapper}
    >
      <textarea
        value={newMessage}
        onChange={handleNewMessage}
        placeholder="Type your message here..."
        className={styles.input}
        onKeyDown={handleKeyDown}
      />
      <button
        type="submit"
        className={styles.button}
        disabled={isSending}
      >
        Send
      </button>
    </form>
  );
};

export default MessageForm;
