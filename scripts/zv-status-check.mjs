import { PrismaClient } from '../prisma/generated/prisma/client/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const rows = await prisma.message.findMany({
  where: { provider: 'zoho_voice', status: 'delivered' },
  select: { id: true, status: true, zohoMessageId: true, createdAt: true, updatedAt: true },
  orderBy: { updatedAt: 'desc' },
  take: 10,
});

console.log('Top 10 zoho_voice/delivered rows by updatedAt desc:');
for (const r of rows) {
  const drift = r.updatedAt - r.createdAt;
  console.log(JSON.stringify({
    id: r.id,
    zohoMessageId: r.zohoMessageId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    driftSec: Math.round(drift / 1000),
  }));
}

const delivered = await prisma.message.count({ where: { provider: 'zoho_voice', status: 'delivered' } });
const sent = await prisma.message.count({ where: { provider: 'zoho_voice', status: 'sent' } });
const received = await prisma.message.count({ where: { provider: 'zoho_voice', status: 'received' } });
const nullStat = await prisma.message.count({ where: { provider: 'zoho_voice', status: null } });
const total = await prisma.message.count({ where: { provider: 'zoho_voice' } });
console.log('zoho_voice counts:', { total, delivered, sent, received, null: nullStat });

// Latest ZV rows by createdAt — see if recent sends have null vs 'delivered'
const recent = await prisma.message.findMany({
  where: { provider: 'zoho_voice' },
  select: { id: true, status: true, createdAt: true, updatedAt: true },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
console.log('\nLatest 10 ZV rows by createdAt:');
for (const r of recent) {
  console.log(JSON.stringify({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    drift: Math.round((r.updatedAt - r.createdAt) / 1000),
  }));
}

await prisma.$disconnect();
