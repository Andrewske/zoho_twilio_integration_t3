'use server';
import { prisma } from '~/utils/prisma.js';
import { PrismaSelectors } from '~/utils/prismaSelectors';

export async function getStudioFromZohoId(owner_id) {
  return await prisma.studio.findFirst({
    where: { zohoId: owner_id },
    select: PrismaSelectors.studio.full
  });
}

export async function getStudioFromPhoneNumber(number) {
  return await prisma.studio.findFirst({
    where: { 
      OR: [
        { twilioPhone: number },
        { zohoVoicePhone: number }
      ]
    },
    select: PrismaSelectors.studio.full
  });
}
