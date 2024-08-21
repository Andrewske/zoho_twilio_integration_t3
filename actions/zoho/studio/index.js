'use server';
import { prisma } from '~/utils/prisma.js';

const studioFields = ['id', 'zohoId', 'smsPhone', 'callPhone', 'name', 'managerName', 'active'];


export async function getStudioFromZohoId(owner_id) {
  return await prisma.studio.findFirst({
    where: { zohoId: owner_id },
    select: studioFields
  });
}

export async function getStudioFromPhoneNumber(number) {
  return await prisma.studio.findFirst({
    where: { smsPhone: number },
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

}
