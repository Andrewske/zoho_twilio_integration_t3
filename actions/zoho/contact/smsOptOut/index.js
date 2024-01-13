
import { updateContact } from '~/actions/zoho/contact/updateContact';
import { logError } from '~/utils/logError';


export const smsOptOut = async ({ studio, contact }) => {

    const zohoModule = contact.isLead ? 'Leads' : 'Contacts';

    if (!contact.SMS_Opt_Out) {
        const data = {
            "data": [
                {
                    "Owner": {
                        "id": studio.zohoId
                    },
                    "SMS_Opt_Out": true
                }
            ]
        }

        try {

            await updateContact({ studioId: studio.id, contactId: contact.id, data, zohoModule })
        } catch (error) {
            logError({ message: 'Error updating contact', error, level: 'warning', data: { studioId: studio.id, contactId: contact.id, data, zohoModule } })
        }
    } else {
        console.log('Contact already opted out of SMS')
    }
}