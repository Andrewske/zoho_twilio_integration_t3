-- AlterTable
ALTER TABLE "Message" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "messagesFound" INTEGER NOT NULL DEFAULT 0,
    "messagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "tasksCreated" INTEGER NOT NULL DEFAULT 0,
    "tasksLinked" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);
