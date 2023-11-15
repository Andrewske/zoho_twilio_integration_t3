import { format } from 'date-fns';
import styles from './styles.module.css';

const Message = ({ message }) => (
  <div
    className={styles.wrapper}
    data-testid="message"
  >
    <span
      className={`${styles.container} ${message.fromStudio ? styles.to : ''}`}
    >
      {message.body}
    </span>
    <span
      className={`${styles.subText} ${message.fromStudio ? styles.to : ''}`}
    >
      <span>
        {message.from} {format(new Date(message.date), 'MMM do h:m aaa ')}
      </span>
      <span></span>
    </span>
  </div>
);

export default Message;
