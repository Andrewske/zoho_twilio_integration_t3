'use client';
import { usePostHog } from 'posthog-js/react';
import { useContext, useEffect, useState } from 'react';
import { Comment } from 'react-loader-spinner';
import { getMessages } from '~/actions/twilio';
import { getStudioFromZohoId } from '~/actions/zoho/studio';
import { ZohoContext } from '~/providers/ZohoProvider';
import { sendError } from '~/utils/toast';
import MessageForm from '../MessageForm';
import MessageList from '../MessageList';
import styles from './styles.module.css';

const ChatWindow = ({ studioPhones }) => {
  const { studio, contact } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null);
  const [currentStudio, setCurrentStudio] = useState('All');
  const [smsPhone, setSmsPhone] = useState(studio?.smsPhone);
  const [filteredMessages, setFilteredMessages] = useState(messages);
  const [allStudios, setAllStudios] = useState([]);
  const [contactOwner, setContactOwner] = useState(studio);
  const posthog = usePostHog();

  useEffect(() => {
    const findMessages = async () => {
      if (contact && studio) {
        try {
          const fetchedMessages = await getMessages({
            contactMobile: contact.Mobile,
            studioId: studio?.id,
          });

          if (fetchedMessages.length === 0) {
            sendError(
              `There are no messages to or from this lead. Be the first to send one!`
            );
          }

          setMessages(fetchedMessages);
        } catch (error) {
          console.error('Error fetching messages:', error);
          sendError('Failed to fetch messages. Please try again later.');
        }
      }
    };

    findMessages();
  }, [contact, studio]); // Removed messages from dependencies

  useEffect(() => {
    const findOwner = async () => {
      if (contact) {
        const newContactOwner = await getStudioFromZohoId(contact.Owner.id);
        setContactOwner(newContactOwner);
      }
    };
    findOwner();
  }, [contact]);

  useEffect(() => {
    const findStudios = async () => {
      if (!contactOwner) return; // Early return if contactOwner is not set

      const isSouthlake = contactOwner.name === 'Southlake';
      let studioNames = [];

      if (messages && messages.length > 0) {
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
        studioNames = isSouthlake ? ['Southlake'] : ['philip_admin'];
      }

      setAllStudios([...new Set(studioNames)]);
      setCurrentStudio(studioNames[0]);
    };

    findStudios();
  }, [contactOwner, messages]);

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
      setSmsPhone(
        contactOwner?.name.includes('Southlake')
          ? contactOwner?.smsPhone
          : studioPhones.find(
              (studioPhone) => studioPhone.name === 'philip_admin'
            ).smsPhone
      );
      setFilteredMessages(messages);
    } else {
      const studioPhone = studioPhones.find(
        (studioPhone) => studioPhone.name === currentStudio
      );
      if (studioPhone) {
        setSmsPhone(studioPhone.smsPhone);
      }
      if (messages && messages.length > 0) {
        const studioMessages = messages.filter(
          (message) => message.studioName === currentStudio
        );
        setFilteredMessages(studioMessages);
      }
    }
  }, [currentStudio, studioPhones, messages, contactOwner]);

  useEffect(() => {
    if (studio) {
      posthog.identify(studio?.id, {
        studioName: studio?.name,
      });
    }
  }, [studio, posthog]);

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
