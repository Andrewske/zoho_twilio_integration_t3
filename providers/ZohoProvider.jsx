'use client';
/* global ZOHO */
import { createContext, useEffect, useState } from 'react';
import useToast from '~/hooks/useToast';
// Create a context
export const ZohoContext = createContext();

// Create a provider component
export function ZohoProvider({ children }) {
  const [leadPhoneNumber, setLeadPhoneNumber] = useState(null);
  const [studioPhoneNumber, setStudioPhoneNumber] = useState(null);
  const [error, setError] = useState(false);

  const { sendError } = useToast();

  useEffect(() => {
    const handlePageLoad = (data) => {
      if (data?.Entity) {
        ZOHO.CRM.API.getRecord({
          Entity: data.Entity,
          RecordID: data.EntityId,
        }).then((response) => {
          console.log('response', response);
          const description = response?.data[0]?.Description;
          const phone = response?.data[0]?.Phone;
          if (phone) {
            console.log('phone', phone);
            setLeadPhoneNumber(phone);
          } else if (description) {
            console.log('description', description);
            const { to } = parseDescription(description);
            setLeadPhoneNumber(to);
          } else {
            sendError(
              'Oops, we cant find a phone number for this lead. Please make sure their phone/mobile field is filled out'
            );
            setError(true);
          }
        });
      }

      ZOHO.CRM.CONFIG.getCurrentUser().then((response) => {
        console.log('current user', response);
        const phone = response?.users[0]?.phone;
        if (phone) {
          setStudioPhoneNumber(phone);
        } else {
          sendError(
            'Oops, we cant find a phone number for the current user. Try refreshing the page'
          );
          setError(true);
        }
      });
    };

    ZOHO.embeddedApp.on('PageLoad', handlePageLoad);
    ZOHO.embeddedApp.init();
  }, []);

  const value = { leadPhoneNumber, studioPhoneNumber, error };

  return <ZohoContext.Provider value={value}>{children}</ZohoContext.Provider>;
}

const parseDescription = (str) => {
  const toIndex = str.indexOf('TO:');
  const fromIndex = str.indexOf(' FROM:');
  const msgIndex = str.indexOf(' MSG:');

  // If any of the required fields are not found, return null
  if (toIndex === -1 || fromIndex === -1 || msgIndex === -1) {
    return null;
  }

  const result = {
    to: str.substring(toIndex + 3, fromIndex),
    from: str.substring(fromIndex + 6, msgIndex),
    msg: str.substring(msgIndex + 5),
  };

  return result;
};
