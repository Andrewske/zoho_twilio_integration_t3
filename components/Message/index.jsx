'use client';
import { format } from 'date-fns';
import styles from './styles.module.css';

const adminNumbers = ['3466161442', '4697185726']

const Message = ({ message, contactName }) => {
  return (
  <div
    className={styles.wrapper}
    data-testid="message"
  >
    <span
      to={message.to}
      className={`${
        adminNumbers.includes(message.to) || adminNumbers.includes(message.from)
          ? 'bg-red'
          : message.provider === 'zoho_voice'
          ? 'bg-purple'
          : 'bg-gray-500'
      } ${styles.container} ${message.fromStudio ? styles.to : ''} `}
    >
      {message.body}
    </span>
    <span
      className={`${styles.subText} ${message.fromStudio ? styles.to : ''}`}
    >
      <span>
        {message.fromStudio
          ? (() => {
              const studioName = message.studioName.split('_').join(' ');
              const provider = message.provider || 'twilio';
              
              // Show "Admin" for admin messages
              if (adminNumbers.includes(message.from)) {
                return message.studioName === 'Southlake' ? 'Southlake' : 'Admin';
              }
              
              return `${studioName} (${provider})`;
            })()
          : contactName}
      </span>
      <span>{format(new Date(message.date), 'MMM do h:mm aaa')}</span>
    </span>
  </div>
)}

export default Message;
