'use client';
import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';
import PropTypes from 'prop-types';
import { format } from 'date-fns';

import { getMessages, sendMessage } from '~/actions/twilio';

const ChatWindow = ({ leadPhoneNumber, studio, messages, toast }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const { sendError, sendSuccess } = toast;

  useEffect(() => {
    if (messages) {
      if (messagesEndRef.current?.scrollIntoView) {
        setTimeout(() => {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
      } else {
        console.log('scrollIntoView method is not supported');
      }
    }
  }, [messages]);

  const handleNewMessage = (event) => {
    setNewMessage(event.target.value);
  };

  // TODO: Enter should submit the form
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!studio) {
      toast.sendError(
        `We can't find which studio you are. Please refresh the page`,
        { autoClose: false }
      );
      return;
    }

    setIsSending(true);

    const body = {
      message: newMessage,
      to: leadPhoneNumber,
      from: studio?.phone,
      studioId: studio?.id,
    };

    const sent = await sendMessage(body);

    if (sent) {
      setNewMessage('');
      sendSuccess('Message sent!');
      getMessages({ leadPhoneNumber, studioId: studio?.id });
    } else {
      sendError('Error sending the message! Try refreshing the page.');
    }
    setIsSending(false);
  };

  const handleKeyDown = (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      handleSubmit(event);
    }
  };
  return (
    <div className={styles.wrapper}>
      <div className={styles.messageContainer}>
        {messages &&
          messages.map((message, index) => (
            <div
              key={`message-${index}`}
              className={styles.messageWrapper}
              ref={index === messages.length - 1 ? messagesEndRef : null}
            >
              <span
                key={index}
                className={`${styles.message} ${
                  message.fromStudio ? styles.to : ''
                }`}
              >
                {message.body}
              </span>
              <span
                className={`${styles.subText} ${
                  message.fromStudio ? styles.to : ''
                }`}
              >
                <span>{message.from}</span>
                <span>
                  {format(new Date(message.date), 'yyyy-MM-dd:HH:mm')}
                </span>
              </span>
            </div>
          ))}
      </div>
      <form
        onSubmit={handleSubmit}
        className={styles.inputContainer}
      >
        <textarea
          value={newMessage}
          onChange={handleNewMessage}
          placeholder="Type your message here..."
          className={styles.input}
          onKeyDown={handleKeyDown}
        ></textarea>
        <button
          type="submit"
          className={styles.button}
          disabled={isSending}
        >
          Send
        </button>
      </form>
    </div>
  );
};

ChatWindow.propTypes = {
  leadPhoneNumber: PropTypes.string,
  userPhoneNumber: PropTypes.string,
  messages: PropTypes.arrayOf(PropTypes.object),
  getMessages: PropTypes.func,
  toast: PropTypes.object,
};

export default ChatWindow;
