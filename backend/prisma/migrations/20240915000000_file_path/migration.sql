-- AlterTable: Add path column to ReviewFile for folder structure support
ALTER TABLE "ReviewFile" ADD COLUMN "path" TEXT NOT NULL DEFAULT '';
