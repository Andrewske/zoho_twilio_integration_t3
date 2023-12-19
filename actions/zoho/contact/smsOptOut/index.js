
import { updateContact } from '~/actions/zoho/contact/updateContact';


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
            console.error('Error updating contact:', error)
        }
    } else {
        console.log('Contact already opted out of SMS')
    }
}