import { PrismaClient } from '../prisma/generated/prisma/client/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

export { prisma };
