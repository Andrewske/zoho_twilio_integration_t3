'use client';
/* global ZOHO */
import { createContext, useEffect, useState } from 'react';
import useToast from '~/hooks/useToast';
import { getStudioData } from '~/actions/zoho';

// Create a context
export const ZohoContext = createContext();

// Create a provider component
export function ZohoProvider({ children }) {
  const [leadPhoneNumber, setLeadPhoneNumber] = useState(null);
  const [studio, setStudio] = useState(null);
  const [error, setError] = useState(false);

  const { sendError, sendSuccess } = useToast();

  useEffect(() => {
    const handlePageLoad = (data) => {
      sendSuccess('Zoho CRM connected successfully');
      if (data?.Entity) {
        ZOHO.CRM.API.getRecord({
          Entity: data.Entity,
          RecordID: data.EntityId,
        }).then((response) => {
          const phone = response?.data[0]?.Phone;
          const mobile = response?.data[0]?.Mobile;

          if (mobile ?? phone) {
            mobile ? setLeadPhoneNumber(mobile) : setLeadPhoneNumber(phone);
          } else {
            sendError(
              'No lead found. Please make sure there is a valid lead for this page',
              false
            );
            setError(true);
          }
        });
      }

      ZOHO.CRM.CONFIG.getCurrentUser().then(async (response) => {
        const user = response?.users[0];
        if (user?.id) {
          console.log({ user });
          const studio = await getStudioData({ zohoId: user.id });
          sendSuccess(`Zoho user: ${studio?.name}`);
          setStudio(studio);
        } else {
          sendError('Cannot locate your Zoho user. Try refreshing the page');
          setError(true);
        }
      });
    };

    ZOHO.embeddedApp.on('PageLoad', handlePageLoad);
    ZOHO.embeddedApp.init();
  }, []);

  const value = { leadPhoneNumber, studio, error };

  return <ZohoContext.Provider value={value}>{children}</ZohoContext.Provider>;
}
