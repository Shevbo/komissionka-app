-- CreateTable
CREATE TABLE "agent_prompt_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_account" VARCHAR(255),
    "llm_model" VARCHAR(255),
    "history_turns" SMALLINT NOT NULL DEFAULT 0,
    "project" VARCHAR(128) NOT NULL,
    "environment" VARCHAR(64) NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "chat_name" VARCHAR(255),
    "topic" VARCHAR(128),
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "file_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "words_sent" INTEGER NOT NULL DEFAULT 0,
    "words_received" INTEGER NOT NULL DEFAULT 0,
    "prompt_hash" VARCHAR(64),
    "system_prompt_len" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_prompt_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_prompt_cache_project_user_account_mode_llm_model_idx" ON "agent_prompt_cache"("project", "user_account", "mode", "llm_model");

-- CreateIndex
CREATE INDEX "agent_prompt_cache_prompt_hash_idx" ON "agent_prompt_cache"("prompt_hash");

-- CreateIndex
CREATE INDEX "agent_prompt_cache_topic_idx" ON "agent_prompt_cache"("topic");

-- CreateIndex
CREATE INDEX "agent_prompt_cache_created_at_idx" ON "agent_prompt_cache"("created_at");
