import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';

const prisma = new PrismaClient().$extends(withAccelerate());

async function prismaQueryWrapper(query) {
    const result = await query;
    await prisma.$disconnect();
    return result;
}

export { prisma, prismaQueryWrapper };
