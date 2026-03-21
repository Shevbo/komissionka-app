/**
 * Единые настройки таймаутов и «протухания» прогонов каталога тестов.
 * Защита от Number('') === 0, Infinity и зависаний без финального update в БД (рестарт PM2 и т.п.).
 */

export function boundedProcessEnvMs(
  envName: string,
  defaultMs: number,
  minMs: number,
  maxMs: number,
): number {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") return defaultMs;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultMs;
  return Math.min(Math.max(Math.floor(n), minMs), maxMs);
}

const DEFAULT_AGENT_FETCH_MS = 180_000;
const DEFAULT_RUN_WALL_MS = 25 * 60 * 1000;
/** Если прогон всё ещё `running` дольше — считаем процесс мёртвым и закрываем при следующем чтении из админки. */
const DEFAULT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export function getAgentFetchTimeoutMs(): number {
  return boundedProcessEnvMs("AGENT_FETCH_TIMEOUT_MS", DEFAULT_AGENT_FETCH_MS, 5_000, 600_000);
}

export function getTestRunMaxWallMs(): number {
  return boundedProcessEnvMs("TEST_RUN_MAX_MS", DEFAULT_RUN_WALL_MS, 60_000, 4 * 60 * 60 * 1000);
}

export function getTestRunStaleAfterMs(): number {
  return boundedProcessEnvMs("TEST_RUN_STALE_AFTER_MS", DEFAULT_STALE_AFTER_MS, 120_000, 72 * 60 * 60 * 1000);
}

/** Таймаут для scope=api (внутренний fetch к Next без ответа). */
export function getTestApiInternalFetchTimeoutMs(): number {
  return boundedProcessEnvMs("TEST_API_FETCH_TIMEOUT_MS", 120_000, 5_000, 300_000);
}

/**
 * Promise.race вокруг fetch: await завершается по таймеру даже если Node игнорирует AbortSignal.
 */
export async function fetchWithTimeoutRace(
  input: string | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let to: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    to = setTimeout(() => {
      controller.abort();
      reject(new Error(`HTTP timeout after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetch(input, { ...(init ?? {}), signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (to !== undefined) clearTimeout(to);
  }
}

export function isTestRunStaleRunning(status: string, startedAt: Date): boolean {
  if (status !== "running") return false;
  return Date.now() - startedAt.getTime() > getTestRunStaleAfterMs();
}

const STALE_MESSAGE =
  "Прогон не завершился в отведённое время (рестарт приложения, обрыв запроса или сбой раннера). Запись закрыта автоматически при открытии в админке.";

/** Для updateMany — без слияния diagnostics по строкам. */
export function staleRunBulkFinalizeData() {
  const now = new Date();
  return {
    status: "failed" as const,
    finished_at: now,
    diagnostics: {
      staleRun: true,
      staleAutoFinalizedAt: now.toISOString(),
      message: STALE_MESSAGE,
    },
    comparison_result: {
      success: false,
      checks: [{ name: "staleRunAutoFinalized", ok: false, details: STALE_MESSAGE }],
    },
  };
}

/** Для одного прогона — сохраняем прежние diagnostics (phase и т.д.). */
export function staleRunMergedFinalizeData(existingDiagnostics: unknown) {
  const now = new Date();
  const prev =
    existingDiagnostics && typeof existingDiagnostics === "object" && existingDiagnostics !== null
      ? (existingDiagnostics as Record<string, unknown>)
      : {};
  return {
    status: "failed" as const,
    finished_at: now,
    diagnostics: {
      ...prev,
      staleRun: true,
      staleAutoFinalizedAt: now.toISOString(),
      message: STALE_MESSAGE,
    },
    comparison_result: {
      success: false,
      checks: [{ name: "staleRunAutoFinalized", ok: false, details: STALE_MESSAGE }],
    },
  };
}
