const dev = process.env.NODE_ENV !== 'production';


export let serverUrl, clientUrl;


clientUrl = dev
    ? 'https://127.0.0.1:5000'
    : 'https://zoho-twilio-integration.vercel.app';

serverUrl = dev
    ? 'https://localhost:3001'
    : 'https://zoho-twilio-integration.vercel.app';
