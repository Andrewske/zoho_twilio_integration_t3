// import { PrismaClient } from '@prisma/client/edge';
import { PrismaClient } from '@prisma/client';
// import { withAccelerate } from '@prisma/extension-accelerate';

const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
})
// .$extends(withAccelerate());

async function prismaQueryWrapper(query) {
    const result = await query;
    await prisma.$disconnect();
    return result;
}

export { prisma, prismaQueryWrapper };
