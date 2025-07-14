'use client';
import { useRef, useEffect } from 'react';
import styles from './styles.module.css';
import Message from '../Message';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const MessageList = ({
  messages,
  contactName,
  selectedSender,
  setSelectedSender,
  availableSenders,
  setSmsPhone,
}) => {
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.scrollTo({
        top: wrapperRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  // TODO: Write a function to check the database for any messages from the contact that are more recent than the last message in the list

  return (
    <div
      className={styles.wrapper}
      ref={wrapperRef}
    >
      <div className="fixed top-4 left-4 px-4 py-2 bg-gold text-black rounded-md shadow-md">
        <DropdownMenu>
          <DropdownMenuTrigger>
            Sending as: {selectedSender?.label || 'Loading...'}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableSenders.map((sender, index) => (
              <DropdownMenuItem
                key={`sender-${index}`}
                onClick={() => {
                  setSelectedSender(sender);
                  setSmsPhone(sender.phone);
                }}
                className="capitalize"
              >
                {sender.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {messages &&
        messages.map((message, index) => (
          <Message
            key={`message-${index}`}
            message={message}
            contactName={contactName}
          />
        ))}
    </div>
  );
};

export default MessageList;
