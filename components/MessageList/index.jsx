'use client';
import { useRef, useEffect, useState } from 'react';
import styles from './styles.module.css';
import Message from '../Message';

const MessageList = ({ messages }) => {
  const messagesEndRef = useRef(null);
  const [prevMessageLength, setPrevMessageLength] = useState(0);

  useEffect(() => {
    if (messages.length > prevMessageLength) {
      setPrevMessageLength(messages.length);
      const scrollableDiv = messagesEndRef.current.parentElement;
      scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
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
