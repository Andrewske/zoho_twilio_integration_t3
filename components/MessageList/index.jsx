'use client';
import { useRef, useEffect, useState } from 'react';
import styles from './styles.module.css';
import Message from '../Message';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const MessageList = ({ messages, contactName }) => {
  const messagesEndRef = useRef(null);
  const [prevMessageLength, setPrevMessageLength] = useState(0);
  const [currentStudio, setCurrentStudio] = useState('All');
  const [allStudios, setAllStudios] = useState(['All']);
  const [filteredMessages, setFilteredMessages] = useState(messages);

  useEffect(() => {
    const scrollableDiv = messagesEndRef.current.parentElement;
    if (messages.length > prevMessageLength) {
      setPrevMessageLength(messages.length);
      scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
    }
  }, [messages.length, prevMessageLength]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      const studioNames = messages.reduce((acc, message) => {
        if (!acc.includes(message.studioName)) {
          acc.push(message.studioName);
        }
        return acc;
      }, []);

      setAllStudios(['All', ...studioNames]);
    }
  }, [messages]);

  useEffect(() => {
    if (currentStudio === 'All') {
      setFilteredMessages(messages);

      return;
    }
    const studioMessages = messages.filter(
      (message) => message.studioName === currentStudio
    );
    setFilteredMessages(studioMessages);
  }, [messages, currentStudio]);

  // TODO: Write a function to check the database for any messages from the contact that are more recent than the last message in the list

  return (
    <div className={styles.wrapper}>
      <div className="fixed top-4 left-4 px-4 py-2 bg-gold text-black rounded-md shadow-md">
        <DropdownMenu>
          <DropdownMenuTrigger>{currentStudio}</DropdownMenuTrigger>
          <DropdownMenuContent>
            {allStudios.map((studio, index) => (
              <DropdownMenuItem
                key={`studio-${index}`}
                onClick={() => setCurrentStudio(studio)}
                className="capitalize"
              >
                {studio.split('_').join(' ')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={styles.wrapper}>
        {filteredMessages &&
          filteredMessages.map((message, index) => (
            <Message
              key={`message-${index}`}
              message={message}
              contactName={contactName}
            />
          ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageList;
