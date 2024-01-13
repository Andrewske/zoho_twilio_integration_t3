
import { updateContact } from '~/actions/zoho/contact/updateContact';
import { logError } from '~/utils/logError';


export const updateStatus = async ({ studio, contact }) => {
    const data = {
        "data": [
            {
                "Owner": {
                    "id": studio.zohoId
                },
                "Lead_Status": "Contacted, Not Booked"
            }
        ]
    }

    try {

        await updateContact({ studioId: studio.id, contactId: contact.id, data, zohoModule: 'Leads' })
    } catch (error) {
        logError({ message: 'Error updating contact', error, level: 'warning', data: { studioId: studio.id, contactId: contact.id, data, zohoModule: 'Leads' } })
    }

}