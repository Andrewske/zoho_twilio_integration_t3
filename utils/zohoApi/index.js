'use client';
/* global ZOHO */

export const getZohoRecord = (entity, entityId) => {
    return ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: entityId });
};

export const getCurrentUser = () => {
    return ZOHO.CRM.CONFIG.getCurrentUser();
};

