'use client';
import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';
import PropTypes from 'prop-types';
import { format } from 'date-fns';

import { getMessages, sendMessage } from '~/actions/twilio';

const ChatWindow = ({ leadPhoneNumber, studio, messages, toast }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [prevMessageCount, setPrevMessageCount] = useState(0);
  const messagesEndRef = useRef(null);
  const { sendError, sendSuccess } = toast;

  const scrollToBottom = () => {
    if (messagesEndRef?.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (messages.length > prevMessageCount) {
      scrollToBottom();
      setPrevMessageCount(messages.length);
    }
  }, [messages.length, prevMessageCount]); // Depend on messages.length instead of messages

  const handleNewMessage = (event) => {
    setNewMessage(event.target.value);
  };

  useEffect(() => {
    console.log('messages rerender');
  }, [messages]);

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

    try {
      await sendMessage(body);
      setNewMessage('');
      sendSuccess('Message sent!');
      getMessages({ leadPhoneNumber, studioId: studio?.id });
    } catch (error) {
      sendError('Error sending the message! Try refreshing the page.');
      throw new Error(error);
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
    <div className={styles.wrapper}>
      <div className={styles.messageContainer}>
        {messages &&
          messages.map((message, index) => (
            <div
              key={`message-${index}`}
              className={styles.messageWrapper}
              // ref={index === messages.length - 1 ? messagesEndRef : null}
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
        <div ref={messagesEndRef} />
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
