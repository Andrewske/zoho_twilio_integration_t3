import { formatMobile } from '~/utils';
import { prisma } from '~/utils/prisma';

const YES_PATTERNS = ['yes', 'yes!', 'yes.', 'yes please', 'yeah', 'yep', 'yea', 'sure', 'absolutely'];

export const isYesMessage = (msg) => YES_PATTERNS.includes(msg?.toLowerCase().trim());

export const isStopMessage = (msg) => msg?.toLowerCase().trim() === 'stop';

export const isAdminNumber = async (to) => {
  const admin = await prisma.studio.findFirst({
    where: { isAdmin: true, twilioPhone: to, active: true },
    select: { id: true },
  });
  return !!admin;
};

export const hasReceivedFollowUpMessage = async (contact) => {
  const message = await prisma.message.findFirst({
    where: {
      twilioMessageId: { not: null },
      toNumber: formatMobile(contact?.Mobile),
      isFollowUpMessage: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return !!message;
};
