import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import useToast from '~/hooks/useToast';
import { sendMessage } from '~/actions/twilio';

const ChatWindow = ({
  leadPhoneNumber,
  userPhoneNumber,
  messages,
  getMessages,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const { sendError, sendSuccess } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewMessage = (event) => {
    setNewMessage(event.target.value);
  };

  // TODO: Enter should submit the form
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!leadPhoneNumber) {
      sendError(
        "Couldn't find the leads phone number, Try refreshing the page."
      );
      return;
    }

    if (!userPhoneNumber) {
      sendError(
        "Couldn't find the studios phone number, Try refreshing the page."
      );
      return;
    }

    setIsSending(true);
    const body = {
      message: newMessage,
      to: leadPhoneNumber,
      from: userPhoneNumber,
    };

    const sent = await sendMessage(body);

    if (sent) {
      setNewMessage('');
      sendSuccess('Message sent!');
      getMessages();
    } else {
      sendError('Error sending the message! Try refreshing the page.');
    }
    setIsSending(false);
  };

  return (
    <div className={styles.wrapper}>
      <div
        className={styles.messageContainer}
        ref={messagesEndRef}
      >
        {messages &&
          messages.map((message, index) => (
            <div
              key={`message-${index}`}
              className={styles.messageWrapper}
            >
              <span
                key={index}
                className={`${styles.message} ${
                  message.fromStudio ? styles.to : ''
                }`}
                ref={index === messages.length - 1 ? messagesEndRef : null}
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
