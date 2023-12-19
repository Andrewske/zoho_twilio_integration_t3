'use client';
import { useState } from 'react';
import styles from './styles.module.css';
import { getMessages, sendMessage } from '~/actions/twilio';
import { sendError, sendSuccess } from '~/utils/toast';

const MessageForm = ({ contact, studio, setMessages }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleNewMessage = (event) => {
    setNewMessage(event.target.value);
  };

  const validateStudio = (studio) => {
    if (!studio) {
      sendError(`We can't find which studio you are. Please refresh the page`, {
        autoClose: false,
      });
      throw new Error({ contact, studio });
    }
  };

  const createMessageBody = (newMessage, contact, studio) => ({
    message: newMessage,
    to: contact.Mobile,
    from: studio?.smsPhone,
    studioId: studio?.id,
    contact,
  });

  const handleSendMessage = async (body) => {
    try {
      const response = await sendMessage(body);
      setNewMessage('');

      if (response?.error) {
        sendError(response.error);
        throw new Error(response.error);
      }

      if (response?.twilioMessageId) {
        sendSuccess('Message sent!');
      }
    } catch (error) {
      sendError(error.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleGetMessages = async () => {
    try {
      const messages = await getMessages({
        contactMobile: contact.Mobile,
        studioId: studio?.id,
      });

      // If there are any messages, set them
      if (messages.length > 0) {
        setMessages(messages);
      }
    } catch (error) {
      throw new Error(error);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    validateStudio(studio);

    setIsSending(true);

    const body = createMessageBody(newMessage, contact, studio);

    await handleSendMessage(body);
    await handleGetMessages();
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