-- AlterTable: add attachments to messages for chat file/photo sharing
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachments" JSONB DEFAULT '[]'::jsonb;
