// Script-only Prisma client. Mirrors `utils/prisma.js` but omits the
// `'server-only'` directive so CLI scripts (audit, backfills, etc.)
// can run outside the Next.js server runtime. Do not import this from
// app/route/server-component code — use `utils/prisma.js` there.
import { PrismaClient } from '../../prisma/generated/prisma/client/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

config();

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__scriptPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__scriptPrisma = prisma;
}
