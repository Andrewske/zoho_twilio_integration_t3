'use server';
import { prisma } from '~/utils/prisma.js';
import { PrismaSelectors } from '~/utils/prismaSelectors';

export async function getStudioFromZohoId(owner_id) {
  return await prisma.studio.findFirst({
    where: { zohoId: owner_id },
    select: PrismaSelectors.studio.full
  });
}

// Prefers a physical (non-admin), active studio on the given phone.
// Falls back to any active studio on the phone if no non-admin match exists.
// Shared-phone scenarios (e.g., Dallas studios sharing one Twilio number)
// would otherwise return a nondeterministic row via findFirst.
export async function getStudioFromPhoneNumber(number) {
  return await prisma.studio.findFirst({
    where: {
      active: true,
      OR: [{ twilioPhone: number }, { zohoVoicePhone: number }],
    },
    orderBy: { isAdmin: 'asc' },
    select: PrismaSelectors.studio.full,
  });
}

// Returns the admin studio attached to the given inbound phone, if any.
// Admin studios route inbound lookups through a broader-visibility Zoho account
// (e.g., a CEO-level login) when multiple physical studios share a number.
export async function findAdminStudioByPhone(number) {
  return await prisma.studio.findFirst({
    where: {
      isAdmin: true,
      active: true,
      OR: [{ twilioPhone: number }, { zohoVoicePhone: number }],
    },
    select: PrismaSelectors.studio.full,
  });
}
