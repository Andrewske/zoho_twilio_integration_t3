// include and initialize the rollbar library with your access token
import Rollbar from 'rollbar'

console.log('Rollbar server token:', process.env.ROLLBAR_POST_SERVER_ACCESS_TOKEN);

export const rollbarConfig = {
    accessToken: process.env.ROLLBAR_POST_SERVER_ACCESS_TOKEN,
    captureUncaught: true,
    captureUnhandledRejections: true,
    environment: 'production'
}

var rollbar = new Rollbar(rollbarConfig)


export const logError = (error) => {
    if (process.env.NODE_ENV === 'production') {
        console.error(error.message)
        rollbar.error(error);
    } else {
        console.error('Error Message:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
    }
}



export default rollbar