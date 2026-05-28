import { formatMobile } from '~/utils';
import { prisma } from '~/utils/prisma';

const YES_PATTERNS = ['yes', 'yes!', 'yes.', 'yes please', 'yeah', 'yep', 'yea', 'sure', 'absolutely'];

// Strip surrounding quotes (straight + iOS smart quotes) so a lead who replies
// `"YES"` or “STOP” still matches. Without this they fall through silently:
// a quoted YES creates a plain task instead of the follow-up, and a quoted STOP
// fails to opt out (TCPA risk).
const normalize = (msg) =>
  msg?.toLowerCase().trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();

export const isYesMessage = (msg) => YES_PATTERNS.includes(normalize(msg));

export const isStopMessage = (msg) => normalize(msg) === 'stop';

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
