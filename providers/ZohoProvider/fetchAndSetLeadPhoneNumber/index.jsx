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
    let phoneNumber = null;
    if (entity === 'Tasks') {
      const description = response?.data[0]?.Description;
      phoneNumber = parseDescription(description);
    } else {
      const phone = response?.data[0]?.Phone;
      const mobile = response?.data[0]?.Mobile;
      phoneNumber = mobile ?? phone;
    }

    if (phoneNumber) {
      setLeadPhoneNumber(phoneNumber.replace('+1', ''));
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

export const parseDescription = (description) => {
  const fromNumberMatch = description.match(/FROM: (\d+)/);
  return fromNumberMatch ? fromNumberMatch[1] : null;
};
