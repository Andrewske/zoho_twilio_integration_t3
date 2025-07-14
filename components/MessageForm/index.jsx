'use client';
import { useState } from 'react';
import styles from './styles.module.css';
import { getMessages } from '~/actions/messages';
import { sendMessage } from '~/actions/messages/sendMessage';
import { sendError, sendSuccess } from '~/utils/toast';
import { getStudioFromZohoId } from '~/actions/zoho/studio';
import { usePostHog } from 'posthog-js/react';

const MessageForm = ({
  contact,
  studio,
  setMessages,
  smsPhone,
  selectedSender,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const posthog = usePostHog();

  const handleNewMessage = (event) => {
    setNewMessage(event.target.value);
  };

  const validateStudio = async (studio) => {
    if (!studio) {
      sendError(`We can't find which studio you are. Please refresh the page`, {
        autoClose: false,
      });
      throw new Error({ contact, studio });
    }
    if (studio.zohoId === process.env.NEXT_PUBLIC_ZOHO_ADMIN_ID) {
      console.log(
        'Admin user, lookup studio',
        JSON.stringify({ contact, studio })
      );
      return await getStudioFromZohoId(contact.Owner.id);
    }
    return studio;
  };

  const createMessageBody = (newMessage, contact, selectedSender) => {
    return {
      message: newMessage,
      to: contact.Mobile,
      from: smsPhone,
      selectedSender, // Pass the selected sender info to server
      contact,
    };
  };

  const handleSendMessage = async (body) => {
    try {
      const response = await sendMessage(body);
      setNewMessage('');

      if (response?.error) {
        sendError(response.error);
        throw new Error(response.error);
      }

      if (response?.success) {
        sendSuccess(`Message sent via ${response.provider === 'twilio' ? 'Twilio' : 'Zoho Voice'}!`);
      }
    } catch (error) {
      sendError(error.message);
    } finally {
      setIsSending(false);
      posthog.capture('message_sent', {
        contactId: contact.id,
        studioId: studio?.id,
      });
    }
  };

  const handleGetMessages = async () => {
    try {
      const messages = await getMessages({
        contactMobile: contact.Mobile,
        studioId: studio?.id,
        contactId: contact?.id,
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

    await validateStudio(studio);

    setIsSending(true);

    const body = createMessageBody(newMessage, contact, selectedSender);

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
      <span className="flex flex-col gap-2">
        <p className="text-sm align-top">
          Sending As: {selectedSender?.label || 'Loading...'}
        </p>
        <button
          type="submit"
          className={`bg-gold ${styles.button}`}
          disabled={isSending}
        >
          Send
        </button>
      </span>
    </form>
  );
};

export default MessageForm;
