-- AlterTable: add user_id to profiles (schema expects it, init migration did not create it)
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "user_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_user_id_key" ON "profiles"("user_id");
