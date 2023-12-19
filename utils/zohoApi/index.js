'use client';
/* global ZOHO */

export const getZohoRecord = (entity, entityId) => {
    return ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: entityId, selectColumns: 'leads(Last Name,Website,Email), contacts(Last Name,Website,Email)' });
};

export const getCurrentUser = () => {
    return ZOHO.CRM.CONFIG.getCurrentUser();
};

