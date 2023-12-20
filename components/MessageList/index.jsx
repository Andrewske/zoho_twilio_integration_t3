'use client';
import { useRef, useEffect, useState } from 'react';
import styles from './styles.module.css';
import Message from '../Message';

const MessageList = ({ messages }) => {
  const messagesEndRef = useRef(null);
  const [prevMessageLength, setPrevMessageLength] = useState(0);

  const smoothScrollToBottom = (element) => {
    const duration = 400; // duration in ms
    const distance = element.scrollHeight - element.scrollTop;
    const perTick = (distance / duration) * 10;

    const scrollInterval = setInterval(() => {
      if (element.scrollTop === element.scrollHeight) {
        clearInterval(scrollInterval);
      } else {
        element.scrollTop += perTick;
      }
    }, 10);
  };

  useEffect(() => {
    if (messages.length > prevMessageLength) {
      setPrevMessageLength(messages.length);
      const scrollableDiv = messagesEndRef.current.parentElement;
      smoothScrollToBottom(scrollableDiv);
    }
  }, [messages.length, prevMessageLength]);

  return (
    <div className={styles.wrapper}>
      {messages &&
        messages.map((message, index) => (
          <Message
            key={`message-${index}`}
            message={message}
          />
        ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
