'use client';
import { usePostHog } from 'posthog-js/react';
import { useContext, useEffect, useState } from 'react';
import { Comment } from 'react-loader-spinner';
import { getMessages } from '~/actions/messages';
import { ZohoContext } from '~/providers/ZohoProvider';
import { sendError } from '~/utils/toast';
import MessageForm from '../MessageForm';
import MessageList from '../MessageList';
import styles from './styles.module.css';

const ChatWindow = ({ studioPhones }) => {
  const { studio, contact } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null);
  const [selectedSender, setSelectedSender] = useState(null);
  const [smsPhone, setSmsPhone] = useState(null);
  const [availableSenders, setAvailableSenders] = useState([]);
  const posthog = usePostHog();

  useEffect(() => {
    const findMessages = async () => {
      if (contact && studio) {
        try {
          const fetchedMessages = await getMessages({
            contactMobile: contact.Mobile,
            studioId: studio?.id,
            contactId: contact?.id,
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
    const buildAvailableSenders = async () => {
      if (!studio || !studioPhones) return;

      const isAdminUser = studio.name === 'philip_admin' || studio.name === 'KevSandbox';
      let senders = [];

      if (isAdminUser) {
        // Admin users can send as any studio that has been in conversation + Admin
        let studiosInConversation = [];
        
        if (messages && messages.length > 0) {
          // Get unique studio names from conversation history
          const studioNamesInConvo = [...new Set(
            messages
              .filter(msg => msg.fromStudio && msg.studioName !== 'Unknown')
              .map(msg => msg.studioName === 'Admin' || msg.studioName === 'philip_admin' ? 'admin' : msg.studioName)
          )];
          
          // Filter studios that are in conversation and have Zoho Voice
          studiosInConversation = studioPhones.filter(s => 
            s.zohoVoicePhone && 
            s.name !== 'philip_admin' && 
            s.name !== 'KevSandbox' &&
            studioNamesInConvo.includes(s.name)
          );
        }
        
        senders = [
          ...studiosInConversation.map(s => ({
            id: s.name,
            label: s.name,
            phone: s.zohoVoicePhone,
            provider: 'zoho_voice'
          })),
          {
            id: 'admin',
            label: 'Admin',
            phone: studioPhones.find(s => s.name === 'philip_admin')?.twilioPhone,
            provider: 'twilio'
          }
        ];
      } else {
        // Regular studio can send as themselves (if they have Zoho Voice) + Admin
        senders = [];
        
        const currentStudioPhone = studioPhones.find(s => s.name === studio.name);
        if (currentStudioPhone?.zohoVoicePhone) {
          senders.push({
            id: studio.name,
            label: studio.name,
            phone: currentStudioPhone.zohoVoicePhone,
            provider: 'zoho_voice'
          });
        }
        
        senders.push({
          id: 'admin',
          label: 'Admin',
          phone: studioPhones.find(s => s.name === 'philip_admin')?.twilioPhone,
          provider: 'twilio'
        });
      }

      setAvailableSenders(senders);

      // Set default sender based on most recent message
      if (messages && messages.length > 0 && senders.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const lastStudioName = lastMessage.studioName;
        
        let defaultSender;
        if (lastStudioName === 'Admin' || lastStudioName === 'philip_admin') {
          defaultSender = senders.find(s => s.id === 'admin');
        } else {
          defaultSender = senders.find(s => s.id === lastStudioName) || senders[0];
        }
        
        setSelectedSender(defaultSender);
        setSmsPhone(defaultSender.phone);
      } else if (senders.length > 0) {
        setSelectedSender(senders[0]);
        setSmsPhone(senders[0].phone);
      }
    };

    buildAvailableSenders();
  }, [studio, studioPhones, messages]);

  useEffect(() => {
    if (studio && !studio?.active) {
      sendError(
        `Hi ${studio?.name}, this feature is currently still in development. Please check back soon!`,
        false
      );
    }
  }, [studio]);


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
        messages={messages}
        contactName={contact.Full_Name}
        selectedSender={selectedSender}
        setSelectedSender={setSelectedSender}
        availableSenders={availableSenders}
        setSmsPhone={setSmsPhone}
      />
      <MessageForm
        contact={contact}
        studio={studio}
        smsPhone={smsPhone}
        selectedSender={selectedSender}
        setMessages={setMessages}
      />
    </div>
  );
};

export default ChatWindow;
