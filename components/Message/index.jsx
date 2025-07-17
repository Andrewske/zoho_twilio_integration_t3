'use client';
import { format } from 'date-fns';
import styles from './styles.module.css';

const Message = ({ message, contactName }) => {
  if (contactName === 'Stephanie Ng') {
    console.log(message)
  }
  return (
  <div
    className={styles.wrapper}
    data-testid="message"
  >
    <span
      name={message.studioName}
      to={message.to}

      className={`${
        message.studioName == 'philip_admin' ||
        message.studioName == 'Philip Gutierrez' ||
        message.studioName == 'Southlake'
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
              if (message.studioName === 'philip_admin' || message.studioName === 'Philip Gutierrez') {
                return 'Admin';
              }
              
              // Show "Southlake" for Southlake messages
              if (message.studioName === 'Southlake') {
                return 'Southlake';
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
