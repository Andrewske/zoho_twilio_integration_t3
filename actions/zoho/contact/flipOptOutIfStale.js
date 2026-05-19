'use server';
import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { updateContact } from '~/actions/zoho/contact/updateContact';

// Reverse-sync worker: given a phone Twilio considers opted-out, flip the
// corresponding Zoho Lead/Contact's SMS_Opt_Out flag to true.
//
// Owner preservation: smsOptOut.js:23 overwrites Owner.id with the calling
// studio's zohoId — fine for the single-studio webhook context but wrong
// here, where the contact may belong to any studio. Preserve the existing
// Owner returned by lookupContact.
export const flipOptOutIfStale = async ({ phone, lookupStudioId }) => {
  let contact;
  try {
    contact = await lookupContact({ mobile: phone, studioId: lookupStudioId });
  } catch (_error) {
    return { outcome: 'lookup_error' };
  }
  if (!contact) return { outcome: 'not_found' };
  if (contact.SMS_Opt_Out) return { outcome: 'already', contactId: contact.id };

  const zohoModule = contact.isLead ? 'Leads' : 'Contacts';
  const data = {
    data: [
      {
        Owner: contact.Owner?.id ? { id: contact.Owner.id } : undefined,
        SMS_Opt_Out: true,
      },
    ],
  };

  try {
    const result = await updateContact({
      studioId: lookupStudioId,
      contactId: contact.id,
      data,
      module: zohoModule,
    });
    if (!result) return { outcome: 'update_error', contactId: contact.id };
    return { outcome: 'flipped', contactId: contact.id, module: zohoModule };
  } catch (_error) {
    return { outcome: 'update_error', contactId: contact.id };
  }
};
