import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { ALL_AGENT_MODELS, type AgentModelOption } from "komiss/lib/agent-models";
import { registerTestRunController, unregisterTestRunController } from "komiss/lib/test-run-control";
import {
  getTestApiInternalFetchTimeoutMs,
  fetchWithTimeoutRace,
  getTestRunnerAgentFetchTimeoutMs,
  getTestRunnerSessionWallMs,
  getTestRunnerMaxChatTurns,
} from "komiss/lib/test-run-config";

const AGENT_PORT = process.env.AGENT_PORT ?? "3140";
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const APP_INTERNAL_BASE_URL = process.env.APP_INTERNAL_BASE_URL ?? "http://127.0.0.1:3000";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

function normalizeAgentMode(raw: unknown): "chat" | "consult" | "dev" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return "dev";
  if (s === "dev" || s.includes("разработ")) return "dev";
  if (s === "consult" || s.includes("консульта")) return "consult";
  if (s === "chat" || s.includes("курил") || s.includes("чат")) return "chat";
  return "dev";
}

function normalizeModelId(raw: unknown): string | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return undefined;
  const lower = s.toLowerCase();
  // Пользователь/ИИ иногда передает сокращённо "Gemini 3" без "Pro".
  // Gemini API ожидает конкретные model IDs из списка ALL_AGENT_MODELS.
  if (lower === "gemini 3") return "gemini-3-pro-preview";
  if (lower === "gemini 3 flash") return "gemini-3-flash-preview";
  // Если это уже model id (например gemini-3-pro-preview) — оставляем.
  if (ALL_AGENT_MODELS.some((m) => m.id === s)) return s;
  // Ищем по имени (например "Gemini 3 Pro" / "Gemini 3 1B").
  const byName = ALL_AGENT_MODELS.find((m: AgentModelOption) => m.name.trim().toLowerCase() === s.toLowerCase());
  if (byName) return byName.id;
  // Если пользователь передал id с modality-шлейфом (|text / |image) — он уже в формате.
  if (ALL_AGENT_MODELS.some((m) => m.id.startsWith(s))) return s;
  return s; // как fallback (в агенте есть legacy-разрешение и другие маппинги)
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const testCaseId = id;
  const testCase = await prisma.test_cases.findUnique({ where: { id: testCaseId } });
  if (!testCase) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 });
  }

  const runCount = await prisma.test_runs.count({ where: { test_case_id: testCaseId } });
  const runNumber = runCount + 1;

  const run = await prisma.test_runs.create({
    data: {
      test_case_id: testCaseId,
      run_number: runNumber,
      status: "running",
      runner: "admin-ui",
      request_context: {
        parameters: testCase.parameters,
        scope: testCase.scope,
        kind: testCase.kind,
      },
    },
  });

  let status: string = "error";
  let agentLogId: string | null = null;
  let comparisonResult: unknown = null;
  let steps: unknown = null;
  let diagnostics: unknown = null;
  const runController = new AbortController();
  registerTestRunController(run.id, runController);

  function safeStringify(value: unknown): string {
    try {
      if (typeof value === "string") return value;
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  try {
    const paramsJson = (testCase.parameters ?? {}) as Record<string, unknown>;
    if (testCase.scope === "agent") {
      const model = normalizeModelId(paramsJson.model);
      const mode = normalizeAgentMode(paramsJson.mode);
      const userPrompt = typeof paramsJson.userPrompt === "string" ? paramsJson.userPrompt : "";
      const expectedText = typeof paramsJson.expectedText === "string" ? paramsJson.expectedText : null;

      // Recursive test-runner for agent-scope:
      // - Вызывает агента в цикле; пока критерий успеха не выполнен — подставляет имитированные ответы пользователя.
      // - Не зависит от «есть ли знак вопроса в ответе»: следующий ход всегда планируется, пока есть лимит ходов.
      const maxChatTurns = getTestRunnerMaxChatTurns();
      const userResponsesRaw = Array.isArray((paramsJson as Record<string, unknown> & { userResponses?: unknown }).userResponses)
        ? ((paramsJson as Record<string, unknown> & { userResponses?: unknown }).userResponses as unknown[])
        : null;
      const userResponses = userResponsesRaw ? userResponsesRaw.filter((x: unknown) => typeof x === "string").map(String) : null;

      type ChatTurn = { role: "user" | "assistant"; content: string };
      const chatHistory: ChatTurn[] = [];

      let currentPrompt = userPrompt;
      let lastSteps: unknown = null;
      let lastAgentLogId: string | null = null;
      let lastResultText = "";
      let lastAgentError: string | undefined = undefined;

      let chatSuccess = false;
      const chatChecks: Array<{ name: string; ok: boolean; details?: string }> = [];
      let localDiagnostics: unknown = null;
      let cancelledByAdmin = false;
      /** Для expectedText=UUID: была ли запись в items до прогона (обязательно для засчитывания удаления). */
      let itemExistedAtRunStart = true;

      const consultModeDisabled = (txt: string): boolean =>
        /режим консультации/i.test(txt) && /операц.*невозможн/i.test(txt);

      const AGENT_FETCH_TIMEOUT_MS = getTestRunnerAgentFetchTimeoutMs();
      /** Жёсткий лимит на весь прогон (все имитированные ходы), без обрыва длинного сценария. */
      const TEST_RUN_MAX_MS = getTestRunnerSessionWallMs();
      const agentRunStartedAt = Date.now();

      /**
       * Таймаут через Promise.race: даже если Node fetch игнорирует AbortSignal, await завершится по таймеру.
       */
      async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
        const controller = new AbortController();
        const onRunAbort = () => controller.abort();
        runController.signal.addEventListener("abort", onRunAbort);
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            const e = new Error(`Превышен таймаут ожидания ответа агента (${timeoutMs} мс).`);
            e.name = "AgentFetchTimeoutError";
            reject(e);
          }, timeoutMs);
        });
        try {
          const fetchPromise = (async () => {
            const res = await fetch(url, { ...init, signal: controller.signal });
            return await res.json();
          })();
          return await Promise.race([fetchPromise, timeoutPromise]);
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          runController.signal.removeEventListener("abort", onRunAbort);
        }
      }

      const expectedTextTrimmed = expectedText?.trim() ?? "";
      const expectedIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedTextTrimmed);

      /**
       * Следующий имитированный ответ пользователя после завершённого хода `completedTurnIndex`
       * (0 = после первого ответа агента на исходный userPrompt).
       */
      const buildSimulatedUserReply = (completedTurnIndex: number): string => {
        if (userResponses && userResponses.length > 0) {
          const idx = Math.min(completedTurnIndex, userResponses.length - 1);
          const v = userResponses[idx]!;
          if (v.trim().length) return v.trim();
        }

        if (expectedIsUuid && expectedTextTrimmed) {
          const id = expectedTextTrimmed;
          const tier = [
            `Подтверждаю: удалите запись items.id=${id} (Prisma delete или эквивалент). Не задавайте уточняющих вопросов — выполните удаление.`,
            `Повтор: единственная цель — физически удалить товар id=${id} из таблицы items. Запустите скрипт или run_command сейчас.`,
            `Обязательно выполните: prisma.items.delete({ where: { id: '${id}' } }). Подтверждаю destructive DML.`,
            `Финальное указание: id=${id} не должен остаться в БД. Завершите вызовами инструментов без вопросов к пользователю.`,
          ];
          return tier[completedTurnIndex % tier.length]!;
        }

        if (!expectedIsUuid && expectedTextTrimmed) {
          const ex = expectedTextTrimmed;
          const tier = [
            `Продолжай и заверши задачу. В итоговом ответе должна появиться подстрока: ${ex}`,
            `Без уточнений: доведи сценарий до конца так, чтобы результат содержал: ${ex}`,
            `Срочно заверши работу; финальный текст должен включать: ${ex}`,
          ];
          return tier[completedTurnIndex % tier.length]!;
        }

        return "Ок, продолжай по плану без дополнительных уточнений. Выполни действие так, как считаешь нужным.";
      };

      try {
        // If expectedText is missing - fail fast.
        if (!expectedTextTrimmed) {
          chatSuccess = false;
          chatChecks.push({
            name: "expectedTextMissing",
            ok: false,
            details: "parameters.expectedText отсутствует или пустой JSON. Заполните параметры через «Обогатить спецификацию с ИИ».",
          });
          localDiagnostics = {
            expectedTextMissing: true,
            hint: "См. test_cases.parameters для тест‑кейса: expectedText должен быть строкой.",
          };
        } else {
          /** Для UUID: успех «удалено» имеет смысл только если запись была в БД до прогона (иначе ложный success). */
          let skipAgentLoop = false;
          if (expectedIsUuid && expectedTextTrimmed) {
            const rowBefore = await prisma.items.findUnique({ where: { id: expectedTextTrimmed } });
            itemExistedAtRunStart = !!rowBefore;
            if (!itemExistedAtRunStart) {
              skipAgentLoop = true;
              chatSuccess = false;
              chatChecks.push({
                name: "expectedItemNotPresentAtRunStart",
                ok: false,
                details:
                  "Запись items с id из expectedText отсутствовала в БД до начала прогона — удаление в этом прогоне не проверено. Создайте или восстановите тестовую запись с этим id.",
              });
              localDiagnostics = {
                expectedItemNotPresentAtRunStart: true,
                expectedItemId: expectedTextTrimmed,
                hint: "Перед прогоном товар с ожидаемым UUID должен существовать в таблице items.",
              };
            }
          }

          if (!skipAgentLoop) {
          for (let turnIndex = 0; turnIndex < maxChatTurns; turnIndex++) {
            if (Date.now() - agentRunStartedAt > TEST_RUN_MAX_MS) {
              chatSuccess = false;
              chatChecks.push({
                name: "runWallClockExceeded",
                ok: false,
                details: `Превышен лимит времени прогона (${TEST_RUN_MAX_MS} мс).`,
              });
              localDiagnostics = {
                runWallClockExceeded: true,
                maxMs: TEST_RUN_MAX_MS,
                elapsedMs: Date.now() - agentRunStartedAt,
              };
              runController.abort();
              break;
            }

            const runState = await prisma.test_runs.findUnique({
              where: { id: run.id },
              select: { status: true },
            });
            if (runState?.status === "cancelled") {
              cancelledByAdmin = true;
              chatSuccess = false;
              localDiagnostics = {
                cancelledByAdmin: true,
                details: "Тест‑кейс прерван администратором.",
              };
              break;
            }

            const body = {
              prompt: currentPrompt,
              history: chatHistory,
              mode,
              ...(model ? { model } : {}),
              project: "Комиссионка",
              chatName: `test-case:${testCase.number}`,
              environment: "test-runner",
              /** Совпадает с fetchJsonWithTimeout и с AGENT_TIMEOUT_MS внутри агента (serve передаёт в runAgent). */
              timeoutMs: AGENT_FETCH_TIMEOUT_MS,
              /** Явно: даже при сбое разбора environment в serve кэш не должен подменять ответ. */
              disableCache: true,
            };

            const agentUrl = `http://127.0.0.1:${AGENT_PORT}/run`;

            // До ответа агента в БД уже виден диалог: пользователь + маркер ожидания (интерактив не пустой).
            const pendingLog: ChatTurn[] = [
              ...chatHistory,
              { role: "user", content: currentPrompt },
              {
                role: "assistant",
                content: `⏳ Ожидание ответа агента (таймаут ${AGENT_FETCH_TIMEOUT_MS} мс за ход)…`,
              },
            ];
            await prisma.test_runs.update({
              where: { id: run.id },
              data: {
                status: "running",
                conversation_log: pendingLog as unknown as object,
                diagnostics: {
                  phase: "awaitingAgent",
                  /** Раунд имитации пользователя в каталоге тестов (1 = первый POST к агенту). */
                  runnerDialogTurn: turnIndex + 1,
                  /** @deprecated Используйте runnerDialogTurn — то же значение; «turn» путали с шагами LLM+tools в steps. */
                  turn: turnIndex + 1,
                  maxChatTurns,
                  simulatedUserUntil: "goalOrCap",
                  stepsMeaning:
                    "В test_runs.steps поля «внутренний шаг N/70» — цикл LLM↔инструменты внутри одного HTTP к агенту; runnerDialogTurn — раунд имитации пользователя в раннере.",
                  agentUrl,
                  timeoutMsPerTurn: AGENT_FETCH_TIMEOUT_MS,
                  maxRunMs: TEST_RUN_MAX_MS,
                  updatedAt: new Date().toISOString(),
                } as unknown as object,
              },
            });

            let data = (await fetchJsonWithTimeout(
              agentUrl,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(AGENT_API_KEY ? { Authorization: `Bearer ${AGENT_API_KEY}` } : {}),
                },
                body: JSON.stringify(body),
              },
              AGENT_FETCH_TIMEOUT_MS,
            )) as {
              result?: string;
              error?: string;
              steps?: unknown;
              logId?: string | null;
            };

            lastSteps = data.steps ?? null;
            lastAgentLogId = data.logId ?? null;
            lastAgentError = typeof data.error === "string" ? data.error : undefined;

            lastResultText =
              typeof data.result === "string" ? data.result : typeof data.error === "string" ? data.error : "";

            // Store readable chat history (user -> assistant).
            if (currentPrompt.trim().length > 0) {
              chatHistory.push({ role: "user", content: currentPrompt });
            }
            if (lastResultText.trim().length > 0) {
              chatHistory.push({ role: "assistant", content: lastResultText });
            }
            await prisma.test_runs.update({
              where: { id: run.id },
              data: {
                status: "running",
                agent_log_id: lastAgentLogId ?? undefined,
                conversation_log: (chatHistory.length ? chatHistory : undefined) as unknown as object,
                steps: lastSteps ?? undefined,
                diagnostics: {
                  phase: "running",
                  runnerDialogTurn: turnIndex + 1,
                  turn: turnIndex + 1,
                  maxChatTurns,
                  stepsMeaning:
                    "В steps агента «внутренний шаг» — не раунд чата с пользователем; см. runnerDialogTurn в diagnostics.",
                  updatedAt: new Date().toISOString(),
                } as unknown as object,
              },
            });

            // If agent refuses because consult-mode disables tools - it's a test failure.
            if (consultModeDisabled(lastResultText)) {
              chatSuccess = false;
              chatChecks.push({
                name: "agentConsultModeDisabled",
                ok: false,
                details: "Агент вернул ошибку о недоступности инструментов в режиме консультации; параметры выполнения не соблюдены.",
              });
              localDiagnostics = {
                agentConsultModeDisabled: true,
                agentResultSnippet: lastResultText.slice(0, 2000),
              };
              break;
            }

            // Критерий успеха: для UUID — запись исчезла из БД после того как существовала до прогона; иначе — подстрока в ответе/steps/payload.
            let goalMet = false;
            if (expectedIsUuid) {
              const item = await prisma.items.findUnique({ where: { id: expectedTextTrimmed } });
              goalMet = Boolean(itemExistedAtRunStart) && !item;
            } else {
              const stepsText = safeStringify(lastSteps);
              const agentPayloadText = safeStringify(data);
              goalMet =
                lastResultText.includes(expectedTextTrimmed) ||
                stepsText.includes(expectedTextTrimmed) ||
                agentPayloadText.includes(expectedTextTrimmed);
            }

            if (goalMet) {
              chatSuccess = true;
              chatChecks.push({
                name: expectedIsUuid ? "dbItemDeletedById" : "containsExpectedText",
                ok: true,
                details: undefined,
              });
              break;
            }

            // Цель не достигнута — всегда планируем следующий имитированный ответ пользователя (если лимит ходов не исчерпан).
            if (turnIndex >= maxChatTurns - 1) {
              localDiagnostics = {
                ...(localDiagnostics && typeof localDiagnostics === "object" ? localDiagnostics : {}),
                simulationTurnsExhausted: true,
                maxChatTurns,
                lastCompletedTurn: turnIndex + 1,
                hint: "Увеличьте TEST_RUN_MAX_CHAT_TURNS или проверьте, что агент реально выполняет сценарий.",
              };
              break;
            }

            currentPrompt = buildSimulatedUserReply(turnIndex);
            continue;
          }
          }

          if (!chatSuccess) {
            if (expectedIsUuid) {
              if (!chatChecks.some((c) => c.name === "expectedItemNotPresentAtRunStart")) {
                const item = await prisma.items.findUnique({ where: { id: expectedTextTrimmed } });
                chatChecks.push({
                  name: "dbItemDeletedById",
                  ok: false,
                  details: item ? "Запись в items по ожидаемому id всё ещё существует." : undefined,
                });
                localDiagnostics = {
                  dbItemStillExists: Boolean(item),
                  expectedItemId: expectedTextTrimmed,
                  lastAgentResultSnippet: lastResultText.slice(0, 2000),
                };
              }
            } else {
              chatChecks.push({
                name: "containsExpectedText",
                ok: false,
                details: "Ожидаемый текст не найден: ни в result, ни в steps/payload агента.",
              });
              localDiagnostics = {
                expectedText: expectedTextTrimmed,
                lastAgentResultSnippet: lastResultText.slice(0, 2000),
              };
            }
          }
        }
      } catch (err) {
        chatSuccess = false;
        if (runController.signal.aborted) {
          cancelledByAdmin = true;
          localDiagnostics = {
            cancelledByAdmin: true,
            details: "Тест‑кейс прерван администратором.",
          };
          chatChecks.push({
            name: "cancelledByAdmin",
            ok: false,
            details: "Выполнение остановлено администратором.",
          });
        } else {
          // Иначе финальный update перезапишет conversation_log пустым chatHistory и сотрёт «ожидание» из БД.
          const u = typeof currentPrompt === "string" ? currentPrompt.trim() : "";
          if (u && !chatHistory.some((t) => t.role === "user" && t.content === u)) {
            chatHistory.push({ role: "user", content: u });
            chatHistory.push({
              role: "assistant",
              content: `[Ошибка: нет ответа агента] ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          const isTimeoutAbort =
            err instanceof Error &&
            (err.name === "AgentFetchTimeoutError" ||
              err.name === "AbortError" ||
              /abort/i.test(err.message) ||
              /timed out/i.test(err.message) ||
              /Превышен таймаут ожидания ответа агента/i.test(err.message));
          localDiagnostics = {
            error: err instanceof Error ? err.message : String(err),
            timeoutMs: AGENT_FETCH_TIMEOUT_MS,
            timeout: isTimeoutAbort,
          };
          chatChecks.push({
            name: isTimeoutAbort ? "agentTimeout" : "runnerError",
            ok: false,
            details: isTimeoutAbort
              ? `Превышен таймаут ожидания ответа агента (${AGENT_FETCH_TIMEOUT_MS} мс).`
              : typeof localDiagnostics === "string"
                ? localDiagnostics
                : safeStringify(localDiagnostics),
          });
        }
      }

      comparisonResult = {
        success: chatSuccess,
        checks: chatChecks,
        agentError: lastAgentError,
      };

      status = cancelledByAdmin ? "cancelled" : chatSuccess ? "success" : "failed";
      if (chatSuccess && expectedIsUuid && itemExistedAtRunStart) {
        localDiagnostics = {
          ...(typeof localDiagnostics === "object" && localDiagnostics ? localDiagnostics : {}),
          itemExistedAtRunStart: true,
          uuidDeleteVerified:
            "Запись с id из expectedText существовала до прогона и отсутствует после — удаление в этом прогоне засчитано осмысленно.",
        };
      }
      diagnostics = localDiagnostics;
      steps = lastSteps ?? undefined;
      agentLogId = lastAgentLogId ?? null;

      // Persist readable conversation log for chat-scoped tests.
      const conversation_log = chatHistory.length ? chatHistory : undefined;

      const finished = await prisma.test_runs.update({
        where: { id: run.id },
        data: {
          status,
          finished_at: new Date(),
          agent_log_id: agentLogId ?? undefined,
          conversation_log: conversation_log as any,
          comparison_result: comparisonResult ?? undefined,
          steps: steps ?? undefined,
          diagnostics: diagnostics ?? undefined,
        },
      });

      unregisterTestRunController(run.id);
      return NextResponse.json({
        data: {
          id: finished.id,
          testCaseId: finished.test_case_id,
          runNumber: finished.run_number,
          status: finished.status,
          startedAt: finished.started_at.toISOString(),
          finishedAt: finished.finished_at?.toISOString() ?? null,
          agentLogId: finished.agent_log_id,
          comparisonResult: finished.comparison_result,
        },
      });
    } else if (testCase.scope === "api") {
      const method = String(paramsJson.method ?? "GET").toUpperCase();
      const url = String(paramsJson.url ?? "");
      const expectedStatus =
        typeof paramsJson.expectedStatus === "number"
          ? (paramsJson.expectedStatus as number)
          : Number(paramsJson.expectedStatus ?? 200);
      const expectedSubstring =
        typeof paramsJson.expectedSubstring === "string" ? paramsJson.expectedSubstring : null;

      const apiFetchMs = getTestApiInternalFetchTimeoutMs();
      const res = await fetchWithTimeoutRace(
        `${APP_INTERNAL_BASE_URL}${url}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(paramsJson.body ?? {}),
        },
        apiFetchMs,
      );

      const text = await res.text();
      const checks: Array<{ name: string; ok: boolean; details?: string }> = [];

      const statusOk = res.status === expectedStatus;
      checks.push({
        name: "status",
        ok: statusOk,
        details: `expected ${expectedStatus}, got ${res.status}`,
      });

      let substringOk = true;
      if (expectedSubstring) {
        substringOk = text.includes(expectedSubstring);
        checks.push({
          name: "bodyContainsExpectedSubstring",
          ok: substringOk,
          details: substringOk ? undefined : "Ожидаемая подстрока не найдена в теле ответа.",
        });
      }

      const success = statusOk && substringOk;
      comparisonResult = { success, checks };
      status = success ? "success" : "failed";
      diagnostics = { responseSnippet: text.slice(0, 2000) };
    } else {
      status = "error";
      diagnostics = {
        message:
          "Автоматический исполнитель пока реализован только для scope=agent и scope=api. Для других типов требуется ручной сценарий.",
      };
    }
  } catch (err) {
    status = "error";
    diagnostics = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const finished = await prisma.test_runs.update({
    where: { id: run.id },
    data: {
      status,
      finished_at: new Date(),
      agent_log_id: agentLogId ?? undefined,
      comparison_result: comparisonResult ?? undefined,
      steps: steps ?? undefined,
      diagnostics: diagnostics ?? undefined,
    },
  });
  unregisterTestRunController(run.id);
  return NextResponse.json({
    data: {
      id: finished.id,
      testCaseId: finished.test_case_id,
      runNumber: finished.run_number,
      status: finished.status,
      startedAt: finished.started_at.toISOString(),
      finishedAt: finished.finished_at?.toISOString() ?? null,
      agentLogId: finished.agent_log_id,
      comparisonResult: finished.comparison_result,
    },
  });
}

