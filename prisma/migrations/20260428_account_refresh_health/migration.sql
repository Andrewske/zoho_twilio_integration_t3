-- AlterTable: add refresh-health columns to Account
-- lastRefreshAt bumps only on successful refresh (separate from @updatedAt
-- which would also bump on failure-marker writes and break health-aware sort).
ALTER TABLE "Account"
  ADD COLUMN "last_refresh_at"       TIMESTAMP(3),
  ADD COLUMN "last_refresh_error"    TEXT,
  ADD COLUMN "last_refresh_error_at" TIMESTAMP(3);
