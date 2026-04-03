'use server'




export const printDatabaseURL = async () => {
    console.log(process.env.DATABASE_URL);
};