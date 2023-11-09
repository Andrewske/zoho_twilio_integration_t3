
import { signal, effect } from '@preact/signals-react'
import { getMessages } from '~/app/actions/twilio'


export const leadPhoneNumber = signal(null)
export const studioPhoneNumber = signal(null)
// export const messages = effect(async () => await getMessages({ leadPhoneNumber, studioPhoneNumber }))