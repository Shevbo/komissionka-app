import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { isOpenRouterModel, getModelById, resolveLegacyModelId } from "komiss/lib/agent-models";
import * as http from "node:http";
import { Readable } from "node:stream";

const AGENT_PORT = process.env.AGENT_PORT ?? "3140";
const AGENT_API_KEY = process.env.AGENT_API_KEY;

/** Быстрая проверка: агент слушает порт (GET /health). При ECONNREFUSED — агент не запущен. */
function checkAgentHealth(port: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: Number(port),
        path: "/health",
        method: "GET",
        timeout: 5000,
      },
      (res) => {
        const ok = res.statusCode === 200;
        resolve(ok ? { ok: true } : { ok: false, error: `health вернул ${res.statusCode}` });
      }
    );
    req.on("error", (e) => {
      const code = (e as NodeJS.ErrnoException).code;
      resolve({
        ok: false,
        error: code === "ECONNREFUSED" ? "ECONNREFUSED" : (e as Error).message,
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.end();
  });
}

/** Запрос к агенту через Node http (обходит проблемы fetch/undici на Windows). */
function agentRequest(
  port: string,
  path: string,
  bodyStr: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ res: http.IncomingMessage; body?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: Number(port),
        path,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(bodyStr, "utf-8"),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = res.complete ? Buffer.concat(chunks).toString("utf-8") : undefined;
          resolve({ res, body });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Agent request timeout"));
    });
    req.write(bodyStr, "utf-8");
    req.end();
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      })
    : null;
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    prompt?: string;
    history?: Array<{ role: string; content: string }>;
    stream?: boolean;
    mode?: string;
    project?: string;
    chatName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  const history = Array.isArray(body.history)
    ? body.history
        .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .map((t) => ({ role: t.role as "user" | "assistant", content: String(t.content) }))
    : undefined;
  const mode =
    body.mode === "chat" || body.mode === "consult" || body.mode === "dev" ? body.mode : undefined;

  const stream = body.stream === true;

  // Выбранная администратором модель (из БД)
  let modelOverride: { model: string; baseUrl?: string; apiKey?: string } | undefined;
  const settings = await prisma.site_settings.findUnique({ where: { id: "main" } });
  const rawModel = settings?.agent_llm_model?.trim();
  const selectedModel = rawModel ? (resolveLegacyModelId(rawModel) ?? rawModel) : undefined;
  if (selectedModel) {
    const provider = isOpenRouterModel(selectedModel) ? "openrouter" : "google";
    const baseUrl =
      provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : process.env.AGENT_LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai";
    const apiKey =
      provider === "openrouter"
        ? process.env.AGENT_OPENROUTER_API_KEY
        : process.env.AGENT_LLM_API_KEY;
    modelOverride = { model: selectedModel, baseUrl, apiKey: apiKey ?? undefined };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Connection: "close",
  };
  if (stream) {
    headers.Accept = "text/event-stream";
  }
  if (AGENT_API_KEY) {
    headers.Authorization = `Bearer ${AGENT_API_KEY}`;
  }

  const modelDisplayName = selectedModel ? getModelById(selectedModel)?.name : undefined;
  const basePath = `/run${stream ? "?stream=1" : ""}`;
  const userAccount = session?.user?.email ?? session?.user?.id ?? null;
  const agentBody: Record<string, unknown> = {
    prompt,
    ...(history?.length ? { history } : {}),
    ...(mode ? { mode } : {}),
    ...(modelOverride ? { model: modelOverride.model, baseUrl: modelOverride.baseUrl, apiKey: modelOverride.apiKey } : {}),
    ...(modelDisplayName ? { modelDisplayName } : {}),
    project: typeof body.project === "string" ? body.project.trim() || "Комиссионка" : "Комиссионка",
    userAccount,
    chatName: typeof body.chatName === "string" ? body.chatName.trim() : undefined,
    environment: "admin",
  };
  const bodyStr = JSON.stringify(agentBody);
  const timeoutMs = 620_000;

  const health = await checkAgentHealth(AGENT_PORT);
  if (!health.ok) {
    const msg =
      health.error === "ECONNREFUSED"
        ? `Агент не запущен (порт ${AGENT_PORT}). В отдельном терминале из корня проекта выполните: npm run agent:serve. Затем откройте http://127.0.0.1:${AGENT_PORT}/health — должен вернуться {"status":"ok"}.`
        : `Агент на порту ${AGENT_PORT} недоступен: ${health.error}. Запустите npm run agent:serve в отдельном терминале.`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const reqHeaders = {
    ...headers,
    "Content-Length": Buffer.byteLength(bodyStr, "utf-8"),
  };

  const isRetryable = (msg: string) => /socket hang up|ECONNRESET|EPIPE|ECONNREFUSED/i.test(msg);
  let lastError: unknown = null;

  try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (stream) {
        const streamResponse = await new Promise<Response>((resolve, reject) => {
          const req = http.request(
            {
              host: "127.0.0.1",
              port: Number(AGENT_PORT),
              path: basePath,
              method: "POST",
              headers: reqHeaders,
              timeout: timeoutMs,
            },
            (res) => {
              if (res.statusCode !== 200) {
                const chunks: Buffer[] = [];
                res.on("data", (c: Buffer) => chunks.push(c));
                res.on("end", () =>
                  reject(new Error(`Agent returned ${res.statusCode}: ${Buffer.concat(chunks).toString("utf-8").slice(0, 200)}`))
                );
                return;
              }
              const webStream = Readable.toWeb(res) as ReadableStream<Uint8Array>;
              resolve(
                new Response(webStream, {
                  headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                  },
                })
              );
            }
          );
          req.on("error", reject);
          req.on("timeout", () => {
            req.destroy();
            reject(new Error("Agent request timeout"));
          });
          req.write(bodyStr, "utf-8");
          req.end();
        });
        return streamResponse;
      }

      const { res, body } = await agentRequest(AGENT_PORT, basePath, bodyStr, headers, timeoutMs);
      const data = body
        ? (JSON.parse(body) as {
            result?: string;
            error?: string;
            steps?: Array<{ type: string; text: string; detail?: string }>;
            logId?: string | null;
          })
        : {};
      if (res.statusCode !== 200 || !res.statusCode) {
        return NextResponse.json(
          { error: data.error ?? `Agent returned ${res.statusCode ?? 0}` },
          { status: res.statusCode && res.statusCode >= 500 ? 502 : res.statusCode ?? 502 }
        );
      }
      return NextResponse.json({
        result: data.result ?? "",
        steps: data.steps ?? [],
        logId: data.logId ?? null,
      });
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);
      if (attempt === 1 && isRetryable(message)) {
        console.warn("[admin/agent] Первый запрос оборвался, повтор через 1.5 с:", message);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      break;
    }
  }

  // Стрим дважды оборвался — пробуем один раз без стрима (ответ одним блоком, часто стабильнее)
  if (stream && isRetryable(lastError instanceof Error ? lastError.message : String(lastError ?? ""))) {
    try {
      await new Promise((r) => setTimeout(r, 1000));
      const { res, body: resBody } = await agentRequest(AGENT_PORT, "/run", bodyStr, headers, timeoutMs);
      const data = resBody
        ? (JSON.parse(resBody) as {
            result?: string;
            error?: string;
            steps?: Array<{ type: string; text: string; detail?: string }>;
            logId?: string | null;
          })
        : {};
      if (res.statusCode === 200) {
        console.warn("[admin/agent] Ответ получен без стрима (fallback).");
        return NextResponse.json({
          result: data.result ?? "",
          steps: data.steps ?? [],
          logId: data.logId ?? null,
        });
      }
    } catch (fallbackErr) {
      console.warn("[admin/agent] Fallback без стрима не удался:", fallbackErr);
      lastError = fallbackErr;
    }
  }

  throw lastError ?? new Error("Сервис агента недоступен");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin/agent]", message);
    const hint =
      /socket hang up|ECONNRESET|EPIPE/i.test(message)
        ? " Смотрите терминал агента — возможно, процесс упал при запросе к ИИ (ошибка Gemini, таймаут и т.п.)."
        : "";
    const portHint =
      " Если порт занят или недоступен, задайте AGENT_PORT в .env (например 3141) и перезапустите агента.";
    return NextResponse.json(
      {
        error: `Сервис агента недоступен (порт ${AGENT_PORT}). Проверьте: 1) В отдельном терминале запущен «npm run agent:serve». 2) В браузере открывается http://127.0.0.1:${AGENT_PORT}/health.${hint}${portHint} Детали: ${message}`,
      },
      { status: 502 }
    );
  }
}
