const { prisma } = require('./utils/prisma.js');

async function checkAccounts() {
  // Check StudioAccount associations
  const studioAccounts = await prisma.studioAccount.findMany({
    include: {
      Studio: {
        select: { name: true, active: true }
      },
      Account: {
        select: { platform: true, clientId: true }
      }
    }
  });
  
  console.log('StudioAccount associations:', JSON.stringify(studioAccounts, null, 2));
  
  // Check which active studios have Zoho accounts
  const activeStudios = await prisma.studio.findMany({
    where: { active: true },
    select: { id: true, name: true }
  });
  
  console.log('\nActive studios with Zoho accounts:');
  for (const studio of activeStudios) {
    const zohoAccount = studioAccounts.find(sa => 
      sa.studioId === studio.id && sa.Account.platform === 'zoho'
    );
    console.log(`- ${studio.name}: ${zohoAccount ? 'HAS' : 'MISSING'} Zoho account`);
  }
  
  await prisma.$disconnect();
}

checkAccounts().catch(console.error);