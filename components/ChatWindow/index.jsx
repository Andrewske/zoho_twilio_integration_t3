'use client';
import { usePostHog } from 'posthog-js/react';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Comment } from 'react-loader-spinner';
import { getMessages } from '~/actions/messages';
import { ZohoContext } from '~/providers/ZohoProvider';
import { sendError } from '~/utils/toast';
import MessageForm from '../MessageForm';
import MessageList from '../MessageList';
import styles from './styles.module.css';

const ChatWindow = ({ studioPhones }) => {
  const adminNumbers = useMemo(
    () =>
      studioPhones
        .filter((s) => s.isAdmin)
        .map((s) => s.twilioPhone)
        .filter(Boolean),
    [studioPhones]
  );
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
      studioName: studio?.name,
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
            studioId: studio?.id,
          });
          sendError(`Failed to fetch messages: ${error.message}`);
        }
      } else {
        console.log('❌ Missing contact or studio:', {
          hasContact: !!contact,
          hasStudio: !!studio,
        });
      }
    };

    findMessages();
  }, [contact, studio]); // Removed messages from dependencies

  useEffect(() => {
    const buildAvailableSenders = async () => {
      if (!studio || !studioPhones) {
        console.log('📞 buildAvailableSenders early return:', {
          hasStudio: !!studio,
          hasStudioPhones: !!studioPhones,
        });
        return;
      }

      console.log('📞 Building available senders for studio:', studio.name);
      console.log('📞 Studio phones data:', studioPhones);

      const isAdminUser = studio.isAdmin;
      console.log('📞 Is admin user:', isAdminUser);
      let senders = [];

      // Special handling for Southlake - they can only send as themselves
      if (studio.name === 'Southlake') {
        console.log('📞 Processing Southlake (special case)');
        senders = [];

        const currentStudioPhone = studioPhones.find(
          (s) => s.name === studio.name
        );

        if (currentStudioPhone?.twilioPhone) {
          console.log(
            '📞 Adding Southlake as sender with Twilio:',
            currentStudioPhone.twilioPhone
          );
          senders.push({
            id: studio.name,
            label: studio.name,
            phone: currentStudioPhone.twilioPhone,
            provider: 'twilio',
          });
        }
      } else if (isAdminUser) {
        // Admin users can send as contact owner + Admin
        senders = [];

        console.log('📞 Contact owner info:', contact?.Owner);

        // Find the contact's owner studio
        if (contact?.Owner?.id) {
          console.log(
            '📞 Looking for contact owner studio with zohoId:',
            contact.Owner.id
          );
          console.log(
            '📞 Available studios with zohoIds:',
            studioPhones.map((s) => ({ name: s.name, zohoId: s.zohoId }))
          );

          const ownerStudio = studioPhones.find((s) => {
            return s.zohoId === contact.Owner.id;
          });

          console.log('📞 Contact owner studio found:', ownerStudio);

          // If contact owner is Southlake, they can only send as themselves
          if (ownerStudio?.name === 'Southlake' && ownerStudio?.twilioPhone) {
            console.log('📞 Adding Southlake contact owner as sender');
            senders.push({
              id: ownerStudio.name,
              label: `${ownerStudio.name} (Owner)`,
              phone: ownerStudio.twilioPhone,
              provider: 'twilio',
            });
          } else if (ownerStudio?.zohoVoicePhone) {
            console.log('📞 Adding contact owner as sender:', ownerStudio.name);
            senders.push({
              id: ownerStudio.name,
              label: `${ownerStudio.name} (Owner)`,
              phone: ownerStudio.zohoVoicePhone,
              provider: 'zoho_voice',
            });
          }
        }

        // Always add Admin option (unless contact owner is Southlake)
        if (
          !contact?.Owner?.id ||
          studioPhones.find((s) => s.zohoId === contact.Owner.id)?.name !==
            'Southlake'
        ) {
          senders.push({
            id: 'admin',
            label: 'Admin',
            phone: studio.twilioPhone,
            provider: 'twilio',
          });
        }
      } else {
        // Regular studio can send as themselves (if they have Zoho Voice) + Admin
        console.log('📞 Processing regular studio senders');
        senders = [];

        const currentStudioPhone = studioPhones.find(
          (s) => s.name === studio.name
        );
        console.log('📞 Current studio phone data:', currentStudioPhone);
        console.log('📞 Looking for studio name:', studio.name);
        console.log(
          '📞 Available studio names:',
          studioPhones.map((s) => s.name)
        );

        if (currentStudioPhone?.zohoVoicePhone) {
          console.log(
            '📞 Adding studio as sender with Zoho Voice:',
            currentStudioPhone.zohoVoicePhone
          );
          senders.push({
            id: studio.name,
            label: studio.name,
            phone: currentStudioPhone.zohoVoicePhone,
            provider: 'zoho_voice',
          });
        } else {
          console.log('📞 Studio not added - missing zohoVoicePhone:', {
            found: !!currentStudioPhone,
            zohoVoicePhone: currentStudioPhone?.zohoVoicePhone,
          });
        }

        // Add Admin option - find the admin whose phone matches this studio's region
        const matchingAdmin = studioPhones.find(
          (s) => s.isAdmin && s.twilioPhone === currentStudioPhone?.twilioPhone
        );
        const adminStudio = matchingAdmin || studioPhones.find((s) => s.isAdmin);
        console.log('📞 Admin studio data:', adminStudio);
        senders.push({
          id: 'admin',
          label: 'Admin',
          phone: adminStudio?.twilioPhone,
          provider: 'twilio',
        });
      }

      console.log('📞 Final available senders:', senders);
      setAvailableSenders(senders);

      // Set default sender based on most recent message
      if (messages && messages.length > 0 && senders.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const lastStudioName = lastMessage.studioName;
        const isAdmin =
          adminNumbers.includes(lastMessage.from) ||
          adminNumbers.includes(lastMessage.to);

        console.log('🔍 Default sender selection debug:', {
          lastMessage,
          lastStudioName,
          isAdmin,
          availableSenderIds: senders.map((s) => s.id),
          adminNumbers,
          lastMessageFrom: lastMessage.from,
          lastMessageTo: lastMessage.to,
          lastMessageKeys: Object.keys(lastMessage),
        });

        let defaultSender;
        if (isAdmin) {
          defaultSender = senders.find((s) => s.id === 'admin');
          console.log('🔍 Admin sender found:', defaultSender);
        } else if (lastStudioName === 'Southlake') {
          defaultSender = senders.find((s) => s.id === 'Southlake');
          console.log('🔍 Southlake sender found:', defaultSender);
        } else {
          defaultSender =
            senders.find((s) => s.id === lastStudioName) || senders[0];
          console.log('🔍 Other studio sender found:', defaultSender);
        }

        console.log('🔍 Final default sender:', defaultSender);

        // Only set if we found a valid default sender
        if (defaultSender) {
          setSelectedSender(defaultSender);
          setSmsPhone(defaultSender.phone);
        } else {
          // Fallback to first available sender
          console.log(
            '🔍 No default sender found, using fallback:',
            senders[0]
          );
          setSelectedSender(senders[0]);
          setSmsPhone(senders[0].phone);
        }
      } else if (senders.length > 0) {
        setSelectedSender(senders[0]);
        setSmsPhone(senders[0].phone);
      }
    };

    buildAvailableSenders();
  }, [studio, studioPhones, messages, contact, adminNumbers]);

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
        adminNumbers={adminNumbers}
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
