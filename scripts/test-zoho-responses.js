#!/usr/bin/env node

import { prisma } from '../utils/prisma.js';

const testPhoneNumbers = [
  '4095492909', // Kay - should exist (30 messages)
  '2145000854', // Southlake - "Contact not found" (10 messages)
  '7137248417', // "Unexpected end of JSON" (1 message)
];

const getZohoAccount = async (studioId) => {
  const studioAccounts = await prisma.studioAccount.findMany({
    where: { studioId },
    include: { Account: true },
  });

  const zohoAccount = studioAccounts
    .map(sa => sa.Account)
    .find(account => account.platform === 'zoho');

  return {
    accessToken: zohoAccount.accessToken,
    apiDomain: zohoAccount.apiDomain || 'https://www.zohoapis.com',
  };
};

const formatMobile = (mobile) => {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  return digits.slice(-10);
};

const testSearch = async (phone, studioId) => {
  const { accessToken, apiDomain } = await getZohoAccount(studioId);
  const mobile = formatMobile(phone);

  console.log(`\nTesting: ${phone} (formatted: ${mobile})`);

  for (const module of ['Leads', 'Contacts']) {
    const fields = 'id,Full_Name,Mobile,SMS_Opt_Out,Lead_Status,Owner';
    const criteria = `(Mobile:equals:${mobile})`;
    const url = `${apiDomain}/crm/v5/${module}/search?fields=${fields}&criteria=${criteria}`;

    console.log(`  Searching ${module}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`    Status: ${response.status} ${response.statusText}`);
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    console.log(`    Content-Type: ${contentType}`);
    console.log(`    Content-Length: ${contentLength}`);

    const text = await response.text();
    console.log(`    Body length: ${text.length}`);
    if (text.length > 0 && text.length < 500) {
      console.log(`    Full body: ${text}`);
    } else if (text.length > 0) {
      console.log(`    Body preview: ${text.substring(0, 200)}...`);
    }

    if (text.length > 0) {
      try {
        const json = JSON.parse(text);
        console.log(`    Has data array: ${!!json.data}`);
        console.log(`    Data length: ${json.data?.length || 0}`);
        if (json.data?.[0]) {
          console.log(`    Found: ${json.data[0].Full_Name} (${json.data[0].id})`);
        }
      } catch (e) {
        console.log(`    JSON parse error: ${e.message}`);
      }
    }
  }
};

const run = async () => {
  const sharedCredsId = 'b2395e84-3a4b-4792-a67b-57ddb8d7e744';

  for (const phone of testPhoneNumbers) {
    await testSearch(phone, sharedCredsId);
  }

  await prisma.$disconnect();
};

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
