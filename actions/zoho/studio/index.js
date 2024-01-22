'use server';
import { logError } from '~/utils/logError';
import { prisma } from '~/utils/prisma.js';

export const getStudioData = async ({ zohoId, phone = null }) => {
  const where = phone ? { smsPhone: phone } : { zohoId };
  try {
    const studio = await prisma.studio.findFirst({
      where: where,
    });

    return studio;
  } catch (error) {
    console.error(error);
    logError({
      message: 'Could not find studio',
      error,
      level: 'warning',
      data: { zohoId, phone },
    });
    return null;
  }
};

export async function getStudioFromZohoId(owner_id) {
  try {
    const studio = await prisma.studio.findFirst({
      where: { zohoId: owner_id },
      select: {
        id: true,
        zohoId: true,
        smsPhone: true,
        callPhone: true,
        name: true,
        managerName: true,
        active: true,
      },
    });
    return studio;
  } catch (error) {
    logError({
      message: 'Could not find studio',
      error,
      level: 'warning',
      data: { owner_id },
    });
    throw new Error('Could not find studio');
  }
}
