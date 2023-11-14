'use server'
import Rollbar from 'rollbar'





export const logError = async (error) => {
    const rollbar = new Rollbar(process.env.ROLLBAR_POST_SERVER_ACCESS_TOKEN,)

    if (process.env.NODE_ENV === 'production') {
        console.error(error)
        rollbar.log(error, (rollbarError) => {
            if (rollbarError) {
                console.error('Rollbar error reporting failed:')
                console.error(rollbarError)
                return
            }
            console.log('Reported error to Rollbar')
        })
    } else {
        console.error('Error Message:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
    }
}
