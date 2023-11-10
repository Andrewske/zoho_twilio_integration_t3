// include and initialize the rollbar library with your access token
import Rollbar from 'rollbar'

export const rollbarConfig = {
    accessToken: process.env.ROLLBAR_POST_SERVER_ACCESS_TOKEN,
    captureUncaught: true,
    captureUnhandledRejections: true,
    environment: 'production'
}

var rollbar = new Rollbar(rollbarConfig)


export const logError = (error) => {
    if (process.env.NODE_ENV === 'production') {
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