'use server'
import Rollbar from 'rollbar'


export const rollbarConfig = {
    accessToken: process.env.ROLLBAR_POST_SERVER_ACCESS_TOKEN,
    captureUncaught: true,
    captureUnhandledRejections: true,
    environment: 'production'
}

var rollbar = new Rollbar(rollbarConfig)


export const logError = async (error) => {
    console.log({ error, env: process.env.NODE_ENV })
    if (process.env.NODE_ENV === 'production') {
        console.error(error.message)
        rollbar.error(error, (rollbarError) => {
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



export default rollbar