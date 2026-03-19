-- Универсальный каталог тест-кейсов (см. docs/manual/test-catalog-architecture.md)

CREATE TABLE "test_modules" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "test_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "test_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" INTEGER NOT NULL,
    "module_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "scope" VARCHAR(32) NOT NULL,
    "prompt_template" TEXT,
    "parameters" JSONB,
    "expected_result" JSONB,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "ui_pages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "api_endpoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "code_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "db_entities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "spec_enriched_by_ai" BOOLEAN NOT NULL DEFAULT false,
    "spec_enriched_at" TIMESTAMPTZ(6),
    "spec_enriched_model" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "test_cases_number_key" ON "test_cases"("number");

CREATE TABLE "test_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "test_case_id" UUID NOT NULL,
    "run_number" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" VARCHAR(32) NOT NULL,
    "runner" VARCHAR(64),
    "request_context" JSONB,
    "agent_log_id" VARCHAR(255),
    "status_dump_path" VARCHAR(1024),
    "conversation_log" JSONB,
    "steps" JSONB,
    "comparison_result" JSONB,
    "diagnostics" JSONB,
    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "test_runs_test_case_id_idx" ON "test_runs"("test_case_id");
CREATE INDEX "test_runs_status_idx" ON "test_runs"("status");
CREATE INDEX "test_runs_started_at_idx" ON "test_runs"("started_at");

ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "test_modules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
