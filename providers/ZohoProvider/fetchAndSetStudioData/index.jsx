import { sendError } from '~/utils/toast';
import { getStudioData } from '~/actions/zoho/studio';
import { sendSuccess } from '~/utils/toast';
import { getCurrentUser } from '~/utils/zohoApi';
import { logError } from '~/utils/logError';

// Function to fetch and set the studio data
export const fetchAndSetStudioData = async ({ setStudio }) => {
  try {
    const userResponse = await getCurrentUser();
    const user = userResponse?.users?.[0];
    console.log(JSON.stringify({ user }));

    if (user?.id) {
      const studio = await getStudioData({ zohoId: user.id });
      sendSuccess(`Zoho user: ${studio?.name}`);
      setStudio(studio);
    } else {
      sendError('Cannot locate your Zoho user. Try refreshing the page');
    }
  } catch (error) {
    const userResponse = await getCurrentUser();
    const user = userResponse?.users?.[0];
    sendError(
      'An error occurred while fetching the studio data. Please try again.'
    );
    logError({
      message: 'fetchAndSetStudio',
      error,
      level: 'warning',
      data: user,
    }); // Log the error for debugging purposes
  }
};
