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
    console.log('🎯 ChatWindow useEffect triggered:', { 
      hasContact: !!contact, 
      hasStudio: !!studio,
      contactMobile: contact?.Mobile,
      studioId: studio?.id,
      studioName: studio?.name
    });

    const findMessages = async () => {
      if (contact && studio) {
        console.log('✅ Both contact and studio exist, calling getMessages');
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
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            contactMobile: contact?.Mobile,
            studioId: studio?.id
          });
          sendError(`Failed to fetch messages: ${error.message}`);
        }
      } else {
        console.log('❌ Missing contact or studio:', { 
          hasContact: !!contact,
          hasStudio: !!studio 
        });
      }
    };

    findMessages();
  }, [contact, studio]); // Removed messages from dependencies


  useEffect(() => {
    const buildAvailableSenders = async () => {
      if (!studio || !studioPhones) {
        console.log('📞 buildAvailableSenders early return:', { hasStudio: !!studio, hasStudioPhones: !!studioPhones });
        return;
      }

      console.log('📞 Building available senders for studio:', studio.name);
      console.log('📞 Studio phones data:', studioPhones);

      const isAdminUser = studio.name === 'philip_admin' || studio.name === 'KevSandbox';
      console.log('📞 Is admin user:', isAdminUser);
      let senders = [];

      if (isAdminUser) {
        // Admin users can send as any studio with Zoho Voice + Admin
        const availableStudios = studioPhones.filter(s => 
          s.zohoVoicePhone && 
          s.name !== 'philip_admin' && 
          s.name !== 'KevSandbox'
        );
        
        console.log('📞 Available studios for admin:', availableStudios);
        
        senders = [
          ...availableStudios.map(s => ({
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
        console.log('📞 Processing regular studio senders');
        senders = [];
        
        const currentStudioPhone = studioPhones.find(s => s.name === studio.name);
        console.log('📞 Current studio phone data:', currentStudioPhone);
        console.log('📞 Looking for studio name:', studio.name);
        console.log('📞 Available studio names:', studioPhones.map(s => s.name));
        
        if (currentStudioPhone?.zohoVoicePhone) {
          console.log('📞 Adding studio as sender with Zoho Voice:', currentStudioPhone.zohoVoicePhone);
          senders.push({
            id: studio.name,
            label: studio.name,
            phone: currentStudioPhone.zohoVoicePhone,
            provider: 'zoho_voice'
          });
        } else {
          console.log('📞 Studio not added - missing zohoVoicePhone:', { 
            found: !!currentStudioPhone, 
            zohoVoicePhone: currentStudioPhone?.zohoVoicePhone 
          });
        }
        
        const adminStudio = studioPhones.find(s => s.name === 'philip_admin');
        console.log('📞 Admin studio data:', adminStudio);
        senders.push({
          id: 'admin',
          label: 'Admin',
          phone: adminStudio?.twilioPhone,
          provider: 'twilio'
        });
      }

      console.log('📞 Final available senders:', senders);
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
