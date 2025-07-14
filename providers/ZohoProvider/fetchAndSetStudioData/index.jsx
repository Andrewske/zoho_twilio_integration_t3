import { sendError } from '~/utils/toast';
import { getStudioFromZohoId } from '~/actions/zoho/studio';
import { sendSuccess } from '~/utils/toast';
import { getCurrentUser } from '~/utils/zohoApi';
import { logError } from '~/utils/logError';

// TODO: Look for the lead owner and then if that studio is not one of the active studios, show the error

// Function to fetch and set the studio data
export const fetchAndSetStudioData = async ({ setStudio }) => {
  try {
    console.log('🏢 Starting fetchAndSetStudioData');
    const userResponse = await getCurrentUser();
    console.log('👤 getCurrentUser response:', userResponse);
    const user = userResponse?.users?.[0];
    console.log('👤 Current user:', user);

    if (user?.id) {
      console.log(`🔍 Looking for studio with zohoId: ${user.id}`);
      const studio = await getStudioFromZohoId(user.id);
      console.log('🏢 Found studio:', studio);
      
      if (studio?.active) {
        console.log(`✅ Setting active studio: ${studio.name}`);
        sendSuccess(`Zoho user: ${studio?.name}`);
        setStudio(studio);
      } else {
        console.log(`❌ Studio not active or not found:`, { studio: studio?.name, active: studio?.active });
        sendError(`Studio ${studio?.name || 'Unknown'} is not active or not found`);
      }
    } else {
      console.log('❌ No user ID found in getCurrentUser response');
      sendError('Cannot locate your Zoho user. Try refreshing the page');
    }
  } catch (error) {
    console.error('❌ Error in fetchAndSetStudioData:', error);
    const userResponse = await getCurrentUser();
    const user = userResponse?.users?.[0];
    sendError(
      `An error occurred while fetching the studio data: ${error.message}`
    );
    logError({
      message: 'fetchAndSetStudio',
      error,
      level: 'warning',
      data: user,
    });
  }
};
