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
        message.fromStudio && message.studioName === 'philip_admin'
          ? 'bg-red'
          : 'bg-purple'
      } ${styles.container} ${message.fromStudio ? styles.to : ''} `}
    >
      {message.body}
    </span>
    <span
      className={`${styles.subText} ${message.fromStudio ? styles.to : ''}`}
    >
      <span>
        {message.fromStudio
          ? message.studioName.split('_').join(' ')
          : contactName}
      </span>
      <span>{format(new Date(message.date), 'MMM do h:mm aaa')}</span>
    </span>
  </div>
);

export default Message;
