const { lookupContact } = require('./actions/zoho/contact/lookupContact');

async function testLookupContact() {
  console.log('Testing contact lookup...');
  
  try {
    // Use the same test data from the testing page
    const result = await lookupContact({ 
      mobile: '7703145316', 
      studioId: "cloj98kgd00092z9whucd9web" // Richmond studio
    });
    
    console.log('Contact lookup result:', JSON.stringify(result, null, 2));
    
    if (!result) {
      console.log('❌ Contact lookup returned null/undefined');
    } else {
      console.log('✅ Contact lookup successful');
      console.log(`Found contact: ${result.Full_Name} (${result.Mobile})`);
    }
    
  } catch (error) {
    console.error('❌ Contact lookup failed with error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
  }
}

testLookupContact().catch(console.error);