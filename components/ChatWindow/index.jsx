'use client';
import styles from './styles.module.css';
import { getMessages } from '~/actions/twilio';
import { useContext, useState, useEffect } from 'react';
import { ZohoContext } from '~/providers/ZohoProvider';
import { Comment } from 'react-loader-spinner';
import { sendError } from '~/utils/toast';
import MessageForm from '../MessageForm';
import MessageList from '../MessageList';
import { getStudioFromZohoId } from '~/actions/zoho/studio';

const ChatWindow = ({ studioPhones }) => {
  const { studio, contact } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null);
  const [currentStudio, setCurrentStudio] = useState('All');
  const [smsPhone, setSmsPhone] = useState(studio?.smsPhone);
  const [filteredMessages, setFilteredMessages] = useState(messages);
  const [allStudios, setAllStudios] = useState([]);
  const [contactOwner, setContactOwner] = useState(studio);

  useEffect(() => {
    const findOwnerFetchMessageSetStudios = async () => {
      if (contact && studio) {
        const contactOwner = await getStudioFromZohoId(contact.Owner.id);
        setContactOwner(contactOwner);

        const isSouthlake = contactOwner.name === 'Southlake';
        let studioNames = [];

        if (!messages) {
          const messages = await getMessages({
            contactMobile: contact.Mobile,
            studioId: studio.id,
          });

          if (messages.length > 0) {
            setMessages(messages);

            const newStudioNames = messages.reduce((acc, message) => {
              if (
                !acc.includes(message.studioName) &&
                message.studioName !== 'Unknown'
              ) {
                acc.push(message.studioName);
              }
              return acc;
            }, []);

            studioNames = isSouthlake
              ? newStudioNames
              : ['All', 'philip_admin', ...newStudioNames];
          } else {
            // If there are no messages, set studioNames based on isSouthlake
            studioNames = isSouthlake ? ['Southlake'] : ['philip_admin'];

            sendError(
              `There are no messages to or from this lead. Be the first to send one!`
            );
          }

          // Simplified final assignment of studioNames
          // if (!isSouthlake) {
          //   studioNames.push('philip_admin');
          // }

          setAllStudios([...new Set(studioNames)]);
          setCurrentStudio(studioNames[0]);
        }
      }
    };
    findOwnerFetchMessageSetStudios();
  }, [contact, studio, messages, allStudios]);

  useEffect(() => {
    if (studio && !studio?.active) {
      sendError(
        `Hi ${studio?.name}, this feature is currently still in development. Please check back soon!`,
        false
      );
    }
  }, [studio]);

  useEffect(() => {
    if (currentStudio === 'All') {
      setSmsPhone(contactOwner?.smsPhone);
      setFilteredMessages(messages);
    } else {
      const studioPhone = studioPhones.find(
        (studioPhone) => studioPhone.name === currentStudio
      );
      if (studioPhone) {
        setSmsPhone(studioPhone.smsPhone);
      }
      if (messages & (messages.length > 0)) {
        const studioMessages = messages.filter(
          (message) => message.studioName === currentStudio
        );
        setFilteredMessages(studioMessages);
      }
    }
  }, [currentStudio, studioPhones, messages, contactOwner]);

  return !messages || !studio?.active ? (
    <Comment
      visible={true}
      height="80"
      width="80"
      ariaLabel="comment-loading"
      wrapperStyle={{}}
      wrapperClass="comment-wrapper"
      color="#fff"
      backgroundColor="#F4442E"
    />
  ) : (
    <div className={styles.wrapper}>
      <div></div>
      <MessageList
        messages={filteredMessages}
        contactName={contact.Full_Name}
        studio={studio}
        currentStudio={currentStudio}
        setCurrentStudio={setCurrentStudio}
        allStudios={allStudios}
      />
      <MessageForm
        contact={contact}
        contactOwner={contactOwner}
        studio={studio}
        smsPhone={smsPhone}
        setMessages={setMessages}
        currentStudio={currentStudio}
      />
    </div>
  );
};

export default ChatWindow;
