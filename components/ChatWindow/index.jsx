import styles from './styles.module.css';

import MessageForm from '../MessageForm';
import MessageList from '../MessageList';

const ChatWindow = ({ leadPhoneNumber, studio, messages }) => {
  return (
    <div className={styles.wrapper}>
      <MessageList messages={messages} />
      <MessageForm
        leadPhoneNumber={leadPhoneNumber}
        studio={studio}
      />
    </div>
  );
};

export default ChatWindow;
