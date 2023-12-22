
import { updateContact } from '~/actions/zoho/contact/updateContact';


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
        console.error('Error updating contact:', error)
    }

}