import { prisma } from '~/utils/prisma.js';
import { PrismaSelectors } from '~/utils/prismaSelectors';

export async function getStudioFromZohoId(owner_id) {
  return prisma.studio.findFirst({
    where: { zohoId: owner_id },
    select: PrismaSelectors.studio.full,
  });
}

// Prefers a physical (non-admin), active studio on the given phone.
// Falls back to any active studio on the phone if no non-admin match exists.
// Shared-phone scenarios (e.g., Dallas studios sharing one Twilio number)
// would otherwise return a nondeterministic row via findFirst.
export async function getStudioFromPhoneNumber(number) {
  return prisma.studio.findFirst({
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
  return prisma.studio.findFirst({
    where: {
      isAdmin: true,
      active: true,
      OR: [{ twilioPhone: number }, { zohoVoicePhone: number }],
    },
    select: PrismaSelectors.studio.full,
  });
}

// Returns the admin studio that shares a Twilio Account with the given studioId.
// Used by /api/zoho/send_welcome to determine the shared `from` number so all
// sub-studios in an admin group send welcomes from one number (e.g. Atlanta
// Midtown -> philip_admin -> 3466161442; Southlake -> southlake_admin ->
// 4697185726).
//
// Contract: at most ONE active admin studio per Twilio Account. Enforced by
// data integrity. Callers handling non-admin studios MUST treat a null return
// as an error and surface it - silent fallback regresses to per-studio numbers.
export async function findAdminStudioForStudio(studioId) {
  return prisma.studio.findFirst({
    where: {
      isAdmin: true,
      active: true,
      StudioAccount: {
        some: {
          Account: {
            platform: 'twilio',
            StudioAccount: { some: { studioId } },
          },
        },
      },
    },
    select: { id: true, name: true, smsPhone: true, twilioPhone: true },
  });
}
