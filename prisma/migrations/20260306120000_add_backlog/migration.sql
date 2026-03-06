-- CreateTable
CREATE TABLE "backlog" (
    "id" UUID NOT NULL,
    "order_num" INTEGER,
    "sprint_number" INTEGER NOT NULL,
    "sprint_status" VARCHAR(64) NOT NULL,
    "short_description" VARCHAR(1024) NOT NULL,
    "description_prompt" TEXT NOT NULL,
    "task_status" VARCHAR(64) NOT NULL,
    "doc_link" VARCHAR(1024),
    "test_order_or_link" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backlog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backlog_sprint_number_idx" ON "backlog"("sprint_number");

-- CreateIndex
CREATE INDEX "backlog_task_status_idx" ON "backlog"("task_status");
