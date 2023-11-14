'use client';
import { Provider, ErrorBoundary } from '@rollbar/react'; // <-- Provider imports 'rollbar' for us

// same configuration you would create for the Rollbar.js SDK
const rollbarConfig = {
  accessToken: process.env.NEXT_APP_ROLLBAR_POST_CLIENT_ACCESS_TOKEN,
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: 'production',
  server: {
    root: 'https://zoho-twilio-integration-t3.vercel.app/',
    branch: 'main',
  },
};

const RollbarProvider = ({ children }) => {
  return (
    <Provider config={rollbarConfig}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Provider>
  );
};
export default RollbarProvider;
