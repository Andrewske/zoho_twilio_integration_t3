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
  const [allStudios, setAllStudios] = useState(['All']);
  const [contactOwner, setContactOwner] = useState(studio);

  useEffect(() => {
    const findContactOwner = async () => {
      if (contact) {
        const contactOwner = await getStudioFromZohoId(contact.Owner.id);
        setContactOwner(contactOwner);

        if (contactOwner.name !== 'Southlake') {
          setAllStudios([...new Set(['philip_admin'])]);
        }
      }
    };
    findContactOwner();
  }, [contact, allStudios]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!messages && contact && studio?.id) {
        let messages = await getMessages({
          contactMobile: contact.Mobile,
          studioId: studio?.id,
        });

        if (messages.length === 0) {
          sendError(
            `There are no messages to or from this lead. Be the first to send one!`
          );
        } else console.log(messages);

        setMessages(messages);
      }
    };

    fetchMessages();
  }, [contact, studio, messages]);

  useEffect(() => {
    if (studio && !studio?.active) {
      sendError(
        `Hi ${studio?.name}, this feature is currently still in development. Please check back soon!`,
        false
      );
    }
  }, [studio]);

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
    } else {
      studioPhones.find((studioPhone) => {
        if (studioPhone.name === currentStudio) {
          setSmsPhone(studioPhone.smsPhone);
        }
      });
    }
  }, [currentStudio, studioPhones, studio, contactOwner]);

  useEffect(() => {
    if (currentStudio === 'All') {
      setFilteredMessages(messages);
      return;
    }
    const studioMessages = messages.filter(
      (message) => message.studioName === currentStudio
    );
    setFilteredMessages(studioMessages);
  }, [messages, currentStudio]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      const studioNames = messages.reduce((acc, message) => {
        if (
          !acc.includes(message.studioName) &&
          message.studioName !== 'Unknown'
        ) {
          acc.push(message.studioName);
        }
        return acc;
      }, []);

      setAllStudios([...new Set(['All', ...studioNames, studio?.name])]);
    }
  }, [messages, studio]);

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
