import { sendError } from '~/utils/toast';
import { getZohoRecord } from '~/utils/zohoApi';

// Function to fetch and set the lead's phone number
export const fetchAndSetLeadPhoneNumber = async ({
  entity,
  entityId,
  setLeadPhoneNumber,
}) => {
  try {
    const response = await getZohoRecord(entity, entityId);
    console.log({ response });
    const phone = response?.data[0]?.Phone;
    const mobile = response?.data[0]?.Mobile;

    if (mobile ?? phone) {
      const phoneNumber = (mobile ?? phone).replace('+1', '');
      setLeadPhoneNumber(phoneNumber);
    } else {
      sendError(
        'No phone number found. Please make sure there is a valid number for this lead',
        false
      );
    }
  } catch (error) {
    sendError(
      "An error occurred while fetching the lead's phone number. Please try again.",
      false
    );
    console.error(error); // Log the error for debugging purposes
  }
};
