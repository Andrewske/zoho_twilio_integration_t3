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


// utils/prisma.js

// import { PrismaClient } from '@prisma/client';

// let prisma;

// if (process.env.NODE_ENV === 'production') {
//   prisma = new PrismaClient();
// } else {
//   if (!global.prisma) {
//     global.prisma = new PrismaClient();
//   }
//   prisma = global.prisma;
// }

// async function prismaQueryWrapper(query) {
//   const result = await query;
//   await prisma.$disconnect();
//   return result;
// }

// export { prisma, prismaQueryWrapper };