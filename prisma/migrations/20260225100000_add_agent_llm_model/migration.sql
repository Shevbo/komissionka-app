-- AlterTable: добавить выбор модели ИИ администратором
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "agent_llm_model" VARCHAR(255);
