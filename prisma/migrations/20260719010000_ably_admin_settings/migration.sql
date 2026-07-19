-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "ablyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "ablyApiKey" TEXT;
