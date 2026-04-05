import type { test_cases, test_runs } from "@prisma/client";

/** Версия схемы экспорта — при изменении полей увеличивать. */
export const TEST_RUN_EXPORT_SCHEMA_VERSION = 1;

export type TestRunExportPayload = {
  schemaVersion: typeof TEST_RUN_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  /** Подсказка для ИИ / поддержки (без секретов). */
  hint: string;
  run: {
    id: string;
    testCaseId: string;
    runNumber: number;
    startedAt: string;
    finishedAt: string | null;
    status: string;
    runner: string | null;
    requestContext: unknown;
    agentLogId: string | null;
    statusDumpPath: string | null;
    conversationLog: unknown;
    steps: unknown;
    comparisonResult: unknown;
    diagnostics: unknown;
  };
  testCase: {
    id: string;
    number: number;
    title: string;
    moduleId: string;
    description: string;
    kind: string;
    scope: string;
    promptTemplate: string | null;
    parameters: unknown;
    expectedResult: unknown;
    tags: string[];
    enabled: boolean;
    uiPages: string[];
    apiEndpoints: string[];
    codeRefs: string[];
    dbEntities: string[];
    specEnrichedByAI: boolean;
    specEnrichedAt: string | null;
    specEnrichedModel: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /** Ссылки внутри приложения (относительные). */
  links: {
    agentLog: string | null;
    interactive: string;
    exportJson: string;
  };
};

export function buildTestRunExportPayload(
  run: test_runs & { test_case: test_cases },
  appOrigin: string,
): TestRunExportPayload {
  const base = appOrigin.replace(/\/$/, "");
  const logId = run.agent_log_id?.trim() ?? null;
  return {
    schemaVersion: TEST_RUN_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    hint:
      "Полный дамп прогона каталога тестов для отладки. Прикрепите файл к чату Cursor/ИИ. Секреты из .env сюда не попадают.",
    run: {
      id: run.id,
      testCaseId: run.test_case_id,
      runNumber: run.run_number,
      startedAt: run.started_at.toISOString(),
      finishedAt: run.finished_at?.toISOString() ?? null,
      status: run.status,
      runner: run.runner,
      requestContext: run.request_context,
      agentLogId: run.agent_log_id,
      statusDumpPath: run.status_dump_path,
      conversationLog: run.conversation_log,
      steps: run.steps,
      comparisonResult: run.comparison_result,
      diagnostics: run.diagnostics,
    },
    testCase: {
      id: run.test_case.id,
      number: run.test_case.number,
      title: run.test_case.title,
      moduleId: run.test_case.module_id,
      description: run.test_case.description,
      kind: run.test_case.kind,
      scope: run.test_case.scope,
      promptTemplate: run.test_case.prompt_template,
      parameters: run.test_case.parameters,
      expectedResult: run.test_case.expected_result,
      tags: run.test_case.tags,
      enabled: run.test_case.enabled,
      uiPages: run.test_case.ui_pages,
      apiEndpoints: run.test_case.api_endpoints,
      codeRefs: run.test_case.code_refs,
      dbEntities: run.test_case.db_entities,
      specEnrichedByAI: run.test_case.spec_enriched_by_ai,
      specEnrichedAt: run.test_case.spec_enriched_at?.toISOString() ?? null,
      specEnrichedModel: run.test_case.spec_enriched_model,
      createdAt: run.test_case.created_at.toISOString(),
      updatedAt: run.test_case.updated_at.toISOString(),
    },
    links: {
      agentLog: logId ? `${base}/api/admin/agent/log?logId=${encodeURIComponent(logId)}` : null,
      interactive: `${base}/admin/test-runs/${run.id}/interactive`,
      exportJson: `${base}/api/admin/test-cases/runs/export/${run.id}`,
    },
  };
}
