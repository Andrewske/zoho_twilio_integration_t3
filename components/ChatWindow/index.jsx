import styles from './styles.module.css';

import MessageForm from '../MessageForm';
import MessageList from '../MessageList';

const ChatWindow = ({ contact, studio, messages, setMessages }) => {
  return (
    <div className={styles.wrapper}>
      <MessageList messages={messages} />
      <MessageForm
        contact={contact}
        studio={studio}
        setMessages={setMessages}
      />
    </div>
  );
};

export default ChatWindow;
