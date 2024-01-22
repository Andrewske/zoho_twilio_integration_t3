import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { getStudioFromZohoId } from '~/actions/zoho/studio';
import { logError } from '~/utils/logError';
import { sendError } from '~/utils/toast';
import { getZohoRecord } from '~/utils/zohoApi';

// Function to fetch and set the lead's phone number
export const fetchAndSetContact = async ({ entity, entityId, setContact }) => {
  try {
    const response = await getZohoRecord(entity, entityId);

    if (response && response.data && response.data[0]) {
      const {
        Mobile: mobile,
        Phone: phone,
        Owner: { id: ownerId },
      } = response.data[0];

      let phoneNumber = null;
      if (entity === 'Tasks') {
        const description = response?.data[0]?.Description;
        phoneNumber = parseDescription(description);
      } else {
        phoneNumber = mobile ?? phone;
      }

      if (phoneNumber) {
        const studio = await getStudioFromZohoId(ownerId);

        if (studio?.active) {
          const contact = await lookupContact({
            mobile: phoneNumber,
            studioId: studio?.id,
          });
          console.log('contact', contact);
          setContact(contact);
        } else {
          sendError('This lead is not assigned to an active studio.', false);
        }
      } else {
        sendError(
          'No phone number found. Please make sure there is a valid number for this lead',
          false
        );
      }
    }
  } catch (error) {
    logError({
      error,
      message: 'fetchAndSetContact',
      level: 'warning',
      data: { entityId },
    }); // Log the error for debugging purposes
    sendError(
      'An error occurred while fetching the contact. Please try again.',
      false
    );
  }
};

export const parseDescription = (description) => {
  try {
    if (typeof description != 'string') {
      console.log('description', description);
      throw new Error('Description is not a string');
    }

    const fromNumberMatch = description?.match(/FROM: (\d+)/);
    return fromNumberMatch ? fromNumberMatch[1] : null;
  } catch (error) {
    logError({
      error,
      message: 'Error parsing description',
      data: { description },
    });
  }
};
