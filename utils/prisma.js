// import { PrismaClient } from '@prisma/client/edge';
import { PrismaClient } from '@prisma/client';
// import { withAccelerate } from '@prisma/extension-accelerate';

const prisma = new PrismaClient({
    datasources: { db: { url: process.env.POSTGRES_PRISMA_URL } }
})
// .$extends(withAccelerate());

async function prismaQueryWrapper(query) {
    const result = await query;
    await prisma.$disconnect();
    return result;
}

export { prisma, prismaQueryWrapper };
