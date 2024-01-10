import { lookupContact } from '~/actions/zoho/contact/lookupContact';
import { getStudioFromZohoId } from '~/app/api/zoho/send_welcome/route';
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
        if (studio?.id) {
          const contact = await lookupContact({
            mobile: phoneNumber,
            studioId: studio?.id,
          });
          setContact(contact);
        }
      } else {
        sendError(
          'No phone number found. Please make sure there is a valid number for this lead',
          false
        );
      }
    }
  } catch (error) {
    sendError(
      'An error occurred while fetching the contact. Please try again.',
      false
    );
  }
};

export const parseDescription = (description) => {
  try {
    const fromNumberMatch = description.match(/FROM: (\d+)/);
    return fromNumberMatch ? fromNumberMatch[1] : null;
  } catch (error) {
    logError({
      error,
      message: 'Error parsing description',
      data: { description },
    });
  }
};
