-- CreateTable
CREATE TABLE "telegram_bind_code" (
    "code" VARCHAR(32) NOT NULL,
    "profile_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telegram_bind_code_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "telegram_bind_code_profile_id_idx" ON "telegram_bind_code"("profile_id");
CREATE INDEX "telegram_bind_code_expires_at_idx" ON "telegram_bind_code"("expires_at");

-- AddForeignKey
ALTER TABLE "telegram_bind_code" ADD CONSTRAINT "telegram_bind_code_profile_id_fkey" 
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
