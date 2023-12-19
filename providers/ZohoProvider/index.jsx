'use client';
/* global ZOHO */
import { createContext, useEffect, useState } from 'react';
import { sendSuccess } from '~/utils/toast';
import { fetchAndSetStudioData } from './fetchAndSetStudioData';
import { fetchAndSetContact } from './fetchAndSetContact';

// Create a context
export const ZohoContext = createContext();

// Create a provider component
export function ZohoProvider({ children }) {
  const [contact, setContact] = useState(null);
  const [studio, setStudio] = useState(null);

  // Updated handlePageLoad function
  const handlePageLoad = async (data) => {
    sendSuccess('Zoho CRM connected successfully');

    const { Entity: entity, EntityId: entityId } = data;
    if (entity && entityId) {
      await fetchAndSetContact({
        entity,
        entityId,
        setContact,
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

  const value = { contact, studio };
  return <ZohoContext.Provider value={value}>{children}</ZohoContext.Provider>;
}
