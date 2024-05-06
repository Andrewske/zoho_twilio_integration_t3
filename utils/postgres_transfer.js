const fs = require('fs');
const csv = require('csv-parser');
const { sql } = require('@vercel/postgres');

require('dotenv').config();

const runQuery = async (queryString) => {
    const { rows } = await queryString;
    return rows;
}

// Function to construct and execute the INSERT query for a given row
const insertAccountRow = async (row) => {
    const { id, platform, clientId, clientSecret, refreshToken, accessToken, authCode, expiresIn, scope, apiDomain } = row;
    const insertQuery = sql`INSERT INTO "Account" ("id", "platform", "clientId", "clientSecret","refreshToken","accessToken","authCode", "expiresIn", "scope", "apiDomain") VALUES (${id}, ${platform}, ${clientId}, ${clientSecret}, ${refreshToken}, ${accessToken}, ${authCode}, ${expiresIn}, ${scope}, ${apiDomain}) RETURNING *`;
    const result = await runQuery(insertQuery);
    console.log(result);
};


const insertStudioRow = async (row) => {
    const { id, zohoId, name, smsPhone, active, callPhone } = row;
    const insertQuery = sql`INSERT INTO "Studio" ("id", "name", "zohoId", "smsPhone", "active", "callPhone") VALUES (${id}, ${name}, ${zohoId}, ${smsPhone}, ${active}, ${callPhone}) RETURNING *`;
    const result = await runQuery(insertQuery);
    console.log(result);
};

const checkStudioIdExists = async (studioId) => {
    const selectQuery = sql`SELECT "id" FROM "Studio" WHERE "id" = ${studioId}`;
    const result = await runQuery(selectQuery);
    return result.length > 0;
};

const checkAccountIdExists = async (accountId) => {
    const selectQuery = sql`SELECT "id" FROM "Account" WHERE "id" = ${accountId}`;
    const result = await runQuery(selectQuery);
    return result.length > 0;
};

const insertStudioAccount = async (row) => {
    const { studioId, accountId } = row;

    // Check if the studioId exists in the Studio table
    const studioIdExists = await checkStudioIdExists(studioId);
    if (!studioIdExists) {
        console.error(`Studio ID ${studioId} does not exist.`);
        return;
    }

    // Check if the accountId exists in the Account table
    const accountIdExists = await checkAccountIdExists(accountId);
    if (!accountIdExists) {
        console.error(`Account ID ${accountId} does not exist.`);
        return;
    }

    // Proceed with the insert operation
    const insertQuery = sql`INSERT INTO "StudioAccount" ("studioId", "accountId") VALUES (${studioId}, ${accountId}) RETURNING *`;
    const result = await runQuery(insertQuery);
    console.log(result);
};

const insertIntoTwilioMessage = async (row) => {
    const { id, studioId, from, to, message, twilioMessageId, created_at, updated_at, contactId } = row;
    const insertQuery = sql`INSERT INTO "TwilioMessage" ("id", "studioId", "from", "to", "message", "twilioMessageId", "created_at", "updated_at", "contactId") VALUES (${id}, ${studioId},${from}, ${to}, ${message}, ${twilioMessageId}, ${created_at}, ${updated_at},${contactId}) RETURNING *`;
    const result = await runQuery(insertQuery);
    console.log(result)
}

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

const batchInsertIntoTwilioMessage = async (rows) => {
    try {
        const result = await prisma.twilioMessage.createMany({
            data: rows
        });
        console.log(result)
    }

    catch (error) {

        console.error(error);
    }
};

const batchInsertIntoMessage = async (rows) => {
    try {
        const result = await prisma.message.createMany({
            data: rows
        });
        console.log(result)
    }

    catch (error) {

        console.error(error);
    }
};

// const updateManagerName = async (row) => {
//     const updateQuery = sql`UPDATE "Studio" SET "managerName" = ${row.managerName} WHERE "id" = ${row.id} RETURNING *`;
//     const result = await runQuery(updateQuery);
//     console.log(`Updated row with ID ${row.id}:`, result);
// };

// // Example: Update managerName for rows where managerName is NULL
// const updateRowsWithMissingManagerName = async () => {
//     // First, find all rows where managerName is NULL
//     const selectQuery = sql`SELECT "id" FROM "Account" WHERE "managerName" IS NULL`;
//     const rowsToUpdate = await runQuery(selectQuery);

//     // Then, update each of these rows
//     for (const row of rowsToUpdate) {
//         // Replace 'New Manager Name' with the actual manager name for each row
//         await updateManagerName(row.id, 'New Manager Name');
//     }
// };

// updateRowsWithMissingManagerName().catch(console.error);

// Read and parse the CSV file
// fs.createReadStream('C:\\Users\\kevin\\Downloads\\twilioMessage.csv')
//     .pipe(csv())
//     .on('data', (row) => {
//         // Assuming the first row of your CSV contains the column names
//         // and you want to skip it
//         if (row.studioId) { // Check if the row has an 'id' field to skip the header
//             insertIntoTwilioMessage(row).catch(console.error);
//         }
//     })
//     .on('end', () => {
//         console.log('CSV file processing completed.');
//     });

const readTwilioMessage = () => {
    let rowsToInsert = [];
    fs.createReadStream('C:\\Users\\kevin\\Downloads\\twilioMessage.csv')
        .pipe(csv())
        .on('data', (row) => {
            // Assuming the first row of your CSV contains the column names
            // and you want to skip it


            // Convert 'createdAt' and 'updatedAt' to ISO-8601 DateTime format
            if (row.createdAt) {
                // Remove milliseconds part and convert to ISO-8601 format
                const dateWithoutMilliseconds = row.createdAt.split('.')[0];
                row.createdAt = new Date(dateWithoutMilliseconds).toISOString();
            }
            if (row.updatedAt) {
                // Remove milliseconds part and convert to ISO-8601 format
                const dateWithoutMilliseconds = row.updatedAt.split('.')[0];
                row.updatedAt = new Date(dateWithoutMilliseconds).toISOString();
            }

            rowsToInsert.push(row);

        })
        .on('end', async () => {
            console.log('CSV file processing completed.');
            // After all rows have been read, execute the batch insert
            // console.log(rowsToInsert)
            await batchInsertIntoTwilioMessage(rowsToInsert).catch(console.error);
        });
}

// readTwilioMessage()

const readMessage = () => {
    let rowsToInsert = [];
    fs.createReadStream('C:\\Users\\kevin\\Downloads\\message.csv')
        .pipe(csv())
        .on('data', (row) => {
            // Convert 'createdAt' and 'updatedAt' to ISO-8601 DateTime format
            if (row.createdAt) {
                const dateWithoutMilliseconds = row.createdAt.split('.')[0];
                row.createdAt = new Date(dateWithoutMilliseconds).toISOString();
            }
            if (row.updatedAt) {
                const dateWithoutMilliseconds = row.updatedAt.split('.')[0];
                row.updatedAt = new Date(dateWithoutMilliseconds).toISOString();
            }

            // Convert 'isFollowUpMessage' and 'isWelcomeMessage' from strings to booleans
            // If the value is null or a falsy value, set it to false
            row.isFollowUpMessage = row.isFollowUpMessage ? row.isFollowUpMessage.toLowerCase() === 'true' : false;
            row.isWelcomeMessage = row.isWelcomeMessage ? row.isWelcomeMessage.toLowerCase() === 'true' : false;

            if (!row.toNumber) {
                console.log('Row with ID' + row.id + 'has an empty toNumber value', row);
            }

            if (!row.fromNumber) {
                console.log('Row with ID' + row.id + 'has an empty fromNumber value', row);
            }

            rowsToInsert.push(row);
        })
        .on('end', async () => {
            console.log('CSV file processing completed.');
            console.log(rowsToInsert[0]); // Log the first row to verify the transformation
            // After all rows have been read, execute the batch insert
            await batchInsertIntoMessage(rowsToInsert).catch(console.error);
        });
};

readMessage()

const readZohoWebhook = () => {
    let rowsToInsert = [];
    fs.createReadStream('C:\\Users\\kevin\\Downloads\\zohoWebhook.csv')
        .pipe(csv())
        .on('data', (row) => {
            // Convert 'createdAt' and 'updatedAt' to ISO-8601 DateTime format
            if (row.createdAt) {
                const dateWithoutMilliseconds = row.createdAt.split('.')[0];
                row.createdAt = new Date(dateWithoutMilliseconds).toISOString();
            }
            if (row.updatedAt) {
                const dateWithoutMilliseconds = row.updatedAt.split('.')[0];
                row.updatedAt = new Date(dateWithoutMilliseconds).toISOString();
            }

            // Convert 'isFollowUpMessage' and 'isWelcomeMessage' from strings to booleans
            // If the value is null or a falsy value, set it to false
            row.isSentFollowUpMessage = row.isSentFollowUpMessage ? row.isSentFollowUpMessage.toLowerCase() === 'true' : false;
            row.isSentWelcomeMessage = row.isSentWelcomeMessage ? row.isSentWelcomeMessage.toLowerCase() === 'true' : false;

            rowsToInsert.push(row);
        })
        .on('end', async () => {
            console.log('CSV file processing completed.');
            console.log(rowsToInsert[0]); // Log the first row to verify the transformation
            // After all rows have been read, execute the batch insert
            await batchInsertIntoMessage(rowsToInsert).catch(console.error);
        });
};

readZohoWebhook()

// const { sql } = require('@vercel/postgres');
// require('dotenv').config();

// // Ensure you have the connection string in your .env file
// const databaseUrl = process.env.POSTGRES_URL;

// // Initialize the `sql` function with the connection string

// const runQuery = async (queryString) => {
//     const { rows } = await queryString;
//     return rows;
// };

// // Correctly use the `sql` function as a tagged template literal

// const id = 'cloj1cs900000yc2zhqf2exao'
// const platform = 'zoho'
// const clientId = '1000.EFN5MGCUW0UGDHCSYJYVA4T8OD4G3H'
// const clientSecret = '4ac78e653727f7533ad893445b31247e070cdbf5b3'
// const refreshToken = '1000.8dead60d712d7f339e203db8be023a35.d1986b28c8fc4ef3806854f2c79e2e82'
// const accessToken = '1000.e2a7874867e2aa623257ef8c04f67267.30ee311550e519da93d4dc26264b97f5'
// const authCode = '1000.f7f090fa64bf0f4b170291b3e158d593.e0de9a2f252ef7e579077b162c3fecab'
// const expiresIn = '3600'
// const scope = 'ZohoCRM.users.ALL,ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.fields.ALL'
// const apiDomain = 'https://www.zohoapis.com'

// const query = sql`INSERT INTO "Account" ("id", "platform", "clientId", "clientSecret","refreshToken","accessToken","authCode", "expiresIn", "scope", "apiDomain") VALUES (${id}, ${platform}, ${clientId}, ${clientSecret}, ${refreshToken}, ${accessToken}, ${authCode}, ${expiresIn}, ${scope}, ${apiDomain}) RETURNING *`;
// (async () => {
//     const rows = await runQuery(query);
//     console.log(rows);
// })();