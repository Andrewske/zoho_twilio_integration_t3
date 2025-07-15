'use client';
import { format } from 'date-fns';
import styles from './styles.module.css';

const Message = ({ message, contactName }) => (
  <div
    className={styles.wrapper}
    data-testid="message"
  >
    <span
      className={`${
        message.studioName == 'philip_admin' ||
        message.studioName == 'Philip Gutierrez'
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
              
              // Show "Admin" for philip_admin messages
              if (message.studioName === 'philip_admin' || message.studioName === 'Philip Gutierrez') {
                return 'Admin';
              }
              
              return `${studioName} (${provider})`;
            })()
          : contactName}
      </span>
      <span>{format(new Date(message.date), 'MMM do h:mm aaa')}</span>
    </span>
  </div>
);

export default Message;
