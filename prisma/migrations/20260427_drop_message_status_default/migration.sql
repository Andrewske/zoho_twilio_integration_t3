-- AlterTable: drop the misleading default that lied about delivery
ALTER TABLE "Message" ALTER COLUMN "status" DROP DEFAULT;
