const { prisma } = require('./utils/prisma.js');

async function checkStudioZohoIds() {
  const studios = await prisma.studio.findMany({
    where: { active: true },
    select: { id: true, name: true, zohoId: true, twilioPhone: true, zohoVoicePhone: true }
  });
  
  console.log('Studios with ZohoIds:', JSON.stringify(studios, null, 2));
  
  const missingZohoId = studios.filter(s => !s.zohoId);
  console.log('\nStudios missing zohoId:', missingZohoId.length);
  missingZohoId.forEach(s => console.log(`- ${s.name}: ${s.zohoId}`));
  
  await prisma.$disconnect();
}

checkStudioZohoIds().catch(console.error);