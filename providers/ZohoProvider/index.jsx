'use client';
/* global ZOHO */
import { createContext, useEffect, useState } from 'react';
import { sendSuccess } from '~/utils/toast';
import { fetchAndSetLeadPhoneNumber } from './fetchAndSetLeadPhoneNumber';
import { fetchAndSetStudioData } from './fetchAndSetStudioData';

// Create a context
export const ZohoContext = createContext();

// Create a provider component
export function ZohoProvider({ children }) {
  const [leadPhoneNumber, setLeadPhoneNumber] = useState(null);
  const [studio, setStudio] = useState(null);

  // Updated handlePageLoad function
  const handlePageLoad = async (data) => {
    sendSuccess('Zoho CRM connected successfully');
    const { Entity: entity, EntityId: entityId } = data;
    if (entity && entityId) {
      await fetchAndSetLeadPhoneNumber({
        entity,
        entityId,
        setLeadPhoneNumber,
      });
    }

    await fetchAndSetStudioData({ setStudio });
  };

  useEffect(() => {
    if (typeof ZOHO !== 'undefined') {
      ZOHO.embeddedApp.on('PageLoad', handlePageLoad);
      ZOHO.embeddedApp.init();
    }
  }, []);

  const value = { leadPhoneNumber, studio };
  return <ZohoContext.Provider value={value}>{children}</ZohoContext.Provider>;
}
