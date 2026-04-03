import { captureServerEvent } from '~/utils/postHogServer';

export const notify = async ({ type, data }) => {
  const safeData = { ...data };
  if (safeData.phone) safeData.phone = `***${safeData.phone.slice(-4)}`;

  await captureServerEvent(type, { ...safeData, source: 'cron' });
};
