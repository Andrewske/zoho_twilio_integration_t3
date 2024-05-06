'use server'




export const printDatabaseURL = () => {
    console.log(process.env.POSTGRES_PRISMA_URL);
};