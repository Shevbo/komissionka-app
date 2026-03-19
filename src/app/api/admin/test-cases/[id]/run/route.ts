import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { ALL_AGENT_MODELS, type AgentModelOption } from "komiss/lib/agent-models";

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

  try {
    const paramsJson = (testCase.parameters ?? {}) as Record<string, unknown>;
    if (testCase.scope === "agent") {
      const model = normalizeModelId(paramsJson.model);
      const mode = normalizeAgentMode(paramsJson.mode);
      const userPrompt = typeof paramsJson.userPrompt === "string" ? paramsJson.userPrompt : "";
      const expectedText = typeof paramsJson.expectedText === "string" ? paramsJson.expectedText : null;

      const body = {
        prompt: userPrompt,
        history: [],
        mode,
        ...(model ? { model } : {}),
        project: "Комиссионка",
        chatName: `test-case:${testCase.number}`,
        environment: "test-runner",
      };

      const res = await fetch(`http://127.0.0.1:${AGENT_PORT}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(AGENT_API_KEY ? { Authorization: `Bearer ${AGENT_API_KEY}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        result?: string;
        error?: string;
        steps?: unknown;
        logId?: string | null;
      };

      steps = data.steps ?? null;
      agentLogId = data.logId ?? null;

      const resultText = typeof data.result === "string" ? data.result : typeof data.error === "string" ? data.error : "";
      const checks: Array<{ name: string; ok: boolean; details?: string }> = [];
      let success = false;
      if (!expectedText || !expectedText.trim()) {
        success = false;
        checks.push({
          name: "expectedTextMissing",
          ok: false,
          details: "parameters.expectedText отсутствует или пустой JSON. Заполните параметры через «Обогатить спецификацию с ИИ».",
        });
        diagnostics = {
          expectedTextMissing: true,
          hint: "См. test_cases.parameters для тест‑кейса: expectedText должен быть строкой.",
        };
      } else {
        const ok = resultText.includes(expectedText);
        success = ok;
        checks.push({
          name: "containsExpectedText",
          ok,
          details: ok ? undefined : "Ожидаемый текст не найден в ответе агента.",
        });
      }

      comparisonResult = {
        success,
        checks,
        agentError: typeof data.error === "string" ? data.error : undefined,
      };
      if (typeof data.error === "string" && data.error.trim()) {
        status = "failed";
        diagnostics = { agentError: data.error };
      } else {
        status = success ? "success" : "failed";
      }
    } else if (testCase.scope === "api") {
      const method = String(paramsJson.method ?? "GET").toUpperCase();
      const url = String(paramsJson.url ?? "");
      const expectedStatus =
        typeof paramsJson.expectedStatus === "number"
          ? (paramsJson.expectedStatus as number)
          : Number(paramsJson.expectedStatus ?? 200);
      const expectedSubstring =
        typeof paramsJson.expectedSubstring === "string" ? paramsJson.expectedSubstring : null;

      const res = await fetch(`${APP_INTERNAL_BASE_URL}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(paramsJson.body ?? {}),
      });

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

