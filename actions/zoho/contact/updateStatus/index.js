'use server';
import { updateContact } from '~/actions/zoho/contact/updateContact';
import { formatMobile } from '~/utils';

export const updateStatus = async ({ studio, contact }) => {
  if (formatMobile(contact?.Mobile) === process.env.KEVIN_MOBILE) return;
  const data = {
    data: [
      {
        Owner: {
          id: studio?.zohoId,
        },
        Lead_Status: 'Contacted, Not Booked',
      },
    ],
  };

  return await updateContact({
    studioId: studio?.id,
    contactId: contact?.id,
    data,
    zohoModule: 'Leads',
  });
};
