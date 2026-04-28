'use server';
import { addToTwilioOptOut } from '~/actions/twilio/optOut';
import { updateContact } from '~/actions/zoho/contact/updateContact';
import {
  TWILIO_OPTOUT_SENDER_ACCOUNTS,
  TWILIO_OPTOUT_SENDER_NUMBERS,
} from '~/lib/twilio-optout-config';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma';

export const smsOptOut = async ({ studio, contact }) => {
  const zohoModule = contact.isLead ? 'Leads' : 'Contacts';

  if (contact.SMS_Opt_Out) {
    console.log('Contact already opted out of SMS');
    await syncToTwilio(contact);
    return;
  }

  const data = {
    data: [
      {
        Owner: {
          id: studio.zohoId,
        },
        SMS_Opt_Out: true,
      },
    ],
  };

  try {
    await updateContact({
      studioId: studio.id,
      contactId: contact.id,
      data,
      zohoModule,
    });
  } catch (error) {
    logError({
      message: 'Error updating contact',
      error,
      level: 'warning',
      data: {
        studioId: studio?.id,
        contactId: contact?.id,
        data,
        zohoModule,
      },
    });
    return;
  }

  await syncToTwilio(contact);
};

// Cross-provider opt-out sync: register the phone in every configured
// Twilio account's Consent Management list. addToTwilioOptOut already
// swallows errors internally; explicit per-account try/catch is belt
// and suspenders so one bad account never stops the others.
const syncToTwilio = async (contact) => {
  for (const accountId of TWILIO_OPTOUT_SENDER_ACCOUNTS) {
    try {
      const account = await prisma.account.findUnique({ where: { id: accountId } });
      if (!account) continue;
      await addToTwilioOptOut({
        phone: contact.Mobile,
        account,
        senderId: TWILIO_OPTOUT_SENDER_NUMBERS[accountId],
        dateOfConsent: new Date(),
      });
    } catch (error) {
      logError({
        message: 'twilio consent sync iteration failure',
        error,
        level: 'warning',
        data: { accountId, contactId: contact?.id },
      });
    }
  }
};
