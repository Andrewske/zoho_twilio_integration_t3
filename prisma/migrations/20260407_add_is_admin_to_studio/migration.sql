-- AlterTable
ALTER TABLE "Studio" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Set existing admin studios
UPDATE "Studio" SET "isAdmin" = true WHERE name IN ('philip_admin', 'KevSandbox', 'KevProd', 'KevDev');
