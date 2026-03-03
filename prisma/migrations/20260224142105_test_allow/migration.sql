-- DropIndex
DROP INDEX "oauth_auth_pending_exp_idx";

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "sender_id" SET DEFAULT '00000000-0000-0000-0000-000000000000';

-- AlterTable
ALTER TABLE "testimonials" ADD COLUMN     "rating" INTEGER;

-- CreateIndex
CREATE INDEX "oauth_auth_pending_exp_idx" ON "oauth_authorizations"("expires_at") WHERE (status = 'pending'::public.oauth_authorization_status);
