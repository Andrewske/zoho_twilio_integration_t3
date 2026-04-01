import { logError } from '~/utils/logError';

export const notify = async ({ type, data }) => {
  const safeData = { ...data };
  if (safeData.phone) safeData.phone = `***${safeData.phone.slice(-4)}`;

  logError({
    message: `NOTIFICATION: ${type}`,
    level: 'warn',
    data: safeData,
  });
  // TODO: Wire to email/slack/sms delivery channel
};
