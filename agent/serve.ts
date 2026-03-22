/**
 * Долгоживущий HTTP-сервер агента (Этап 4, Вариант A).
 * Запуск: npm run agent:serve. Контракт: POST /run { "prompt": "..." } → { "result": "..." } или { "error": "..." }.
 */
import "./load-env.js";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { runAgent } from "./contract.js";

const BODY_MAX = 1024 * 1024; // 1 MB — длинная история чата может быть большой

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    req.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > BODY_MAX) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

type AgentMode = "chat" | "consult" | "dev";

interface ParsedRequest {
  prompt: string;
  history?: HistoryTurn[];
  mode?: AgentMode;
  modelOverride?: { model: string; baseUrl?: string; apiKey?: string };
  modelDisplayName?: string;
  project?: string;
  userAccount?: string | null;
  chatName?: string | null;
  environment?: string;
  /**
   * Входные изображения (например, data URL из админки или Telegram).
   * data — base64 без data:-префикса.
   */
  inputImages?: Array<{ mimeType: string; data: string }>;
  /** Отключить кэширование (agent_prompt_cache) для этого запроса. */
  disableCache?: boolean;
  /** Версии app/agent/tgbot из приложения — для подвала. */
  footerVersions?: { app: string; agent: string; tgbot: string };
  /** Переопределение таймаута runAgent (мс). Раннер каталога тестов передаёт тот же бюджет, что и HTTP-клиент. */
  timeoutMs?: number;
}

/** 30 с … 45 мин — согласовано с getTestRunnerAgentFetchTimeoutMs на стороне приложения. */
function parseTimeoutMsFromBody(data: unknown): number | undefined {
  if (!data || typeof data !== "object" || !("timeoutMs" in data)) return undefined;
  const v = (data as { timeoutMs?: unknown }).timeoutMs;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const ms = Math.floor(n);
  const MIN = 30_000;
  const MAX = 45 * 60 * 1000;
  return Math.min(Math.max(ms, MIN), MAX);
}

function parseRequest(body: string): ParsedRequest | null {
  try {
    const data = JSON.parse(body) as unknown;
    if (data && typeof data === "object" && "prompt" in data && typeof (data as { prompt: unknown }).prompt === "string") {
      const prompt = (data as { prompt: string }).prompt;
      let history: HistoryTurn[] | undefined;
      if ("history" in data && Array.isArray((data as { history: unknown }).history)) {
        const raw = (data as { history: unknown[] }).history;
        history = raw
          .filter((t) => t && typeof t === "object" && "role" in t && "content" in t)
          .map((t) => ({
            role: (t as { role: string }).role === "assistant" ? "assistant" : "user",
            content: String((t as { content: unknown }).content),
          }));
      }
      const mode = (data as { mode?: string }).mode;
      const validMode: AgentMode | undefined =
        mode === "chat" || mode === "consult" || mode === "dev" ? mode : undefined;
      let modelOverride: ParsedRequest["modelOverride"];
      if ("model" in data && typeof (data as { model: unknown }).model === "string" && (data as { model: string }).model.trim()) {
        const model = (data as { model: string }).model.trim();
        const baseUrl = (data as { baseUrl?: string }).baseUrl;
        const apiKey = (data as { apiKey?: string | null }).apiKey;
        modelOverride = { model, baseUrl: typeof baseUrl === "string" ? baseUrl : undefined, apiKey: typeof apiKey === "string" ? apiKey : apiKey === null ? undefined : undefined };
      }
      const modelDisplayName = "modelDisplayName" in data && typeof (data as { modelDisplayName?: unknown }).modelDisplayName === "string"
        ? (data as { modelDisplayName: string }).modelDisplayName.trim()
        : undefined;
      const project = "project" in data && typeof (data as { project?: unknown }).project === "string"
        ? (data as { project: string }).project.trim()
        : undefined;
      const userAccount = "userAccount" in data
        ? (typeof (data as { userAccount?: unknown }).userAccount === "string"
          ? (data as { userAccount: string }).userAccount.trim() || undefined
          : (data as { userAccount?: unknown }).userAccount === null ? null : undefined)
        : undefined;
      const chatName = "chatName" in data && typeof (data as { chatName?: unknown }).chatName === "string"
        ? (data as { chatName: string }).chatName.trim()
        : undefined;
      const environment = "environment" in data && typeof (data as { environment?: unknown }).environment === "string"
        ? (data as { environment: string }).environment.trim()
        : undefined;

      let inputImages: Array<{ mimeType: string; data: string }> | undefined;
      if ("inputImages" in data) {
        const raw = (data as { inputImages?: unknown }).inputImages;
        if (Array.isArray(raw)) {
          const parsed: Array<{ mimeType: string; data: string }> = [];
          for (const item of raw) {
            if (typeof item === "string") {
              const m = /^data:(image\/[a-zA-Z0-9.+-]+);\s*base64\s*,\s*(.+)$/.exec(item.trim());
              if (m) {
                parsed.push({ mimeType: m[1], data: m[2] });
              }
            } else if (item && typeof item === "object") {
              const obj = item as { mimeType?: unknown; data?: unknown };
              const mime = typeof obj.mimeType === "string" && obj.mimeType.trim() ? obj.mimeType.trim() : "image/png";
              const d = typeof obj.data === "string" && obj.data.trim() ? obj.data.trim() : "";
              if (d) parsed.push({ mimeType: mime, data: d });
            }
          }
          if (parsed.length > 0) inputImages = parsed;
        }
      }
      const disableCache =
        "disableCache" in data && (data as { disableCache?: unknown }).disableCache === true;
      let footerVersions: { app: string; agent: string; tgbot: string } | undefined;
      if ("footerVersions" in data && data.footerVersions && typeof data.footerVersions === "object") {
        const fv = data.footerVersions as { app?: unknown; agent?: unknown; tgbot?: unknown };
        if (typeof fv.app === "string" && typeof fv.agent === "string" && typeof fv.tgbot === "string") {
          footerVersions = { app: fv.app, agent: fv.agent, tgbot: fv.tgbot };
        }
      }
      const timeoutMs = parseTimeoutMsFromBody(data);
      return {
        prompt,
        history,
        mode: validMode,
        modelOverride,
        modelDisplayName: modelDisplayName || undefined,
        project: project || undefined,
        userAccount,
        chatName: chatName || undefined,
        environment: environment || undefined,
        inputImages,
        disableCache,
        footerVersions,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function checkAuth(req: import("node:http").IncomingMessage, apiKey: string): boolean {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7) === apiKey;
  }
  const xKey = req.headers["x-api-key"];
  return typeof xKey === "string" && xKey === apiKey;
}

function safeEnd(res: import("node:http").ServerResponse, code: number, body: string): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(body);
  } catch {
    try {
      res.destroy();
    } catch {
      // ignore
    }
  }
}

async function handleRun(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
  console.log("[agent] handleRun: method=%s url=%s", req.method, req.url);
  try {
    if (req.method !== "POST") {
      safeEnd(res, 405, JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    const config = getConfig();
    console.log("[agent] config ok, reading body...");
    if (config.apiKey && !checkAuth(req, config.apiKey)) {
      safeEnd(res, 401, JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch (e) {
      console.error("[agent] readBody error:", e instanceof Error ? e.message : e);
      try {
        safeEnd(res, 413, JSON.stringify({ error: "Request body too large" }));
      } catch {
        // клиент уже закрыл соединение
      }
      return;
    }

    console.log("[agent] body ok, parsing...");
    const parsed = parseRequest(body);
    if (!parsed) {
      safeEnd(res, 400, JSON.stringify({ error: "Invalid body: expected { \"prompt\": \"...\" }" }));
      return;
    }

    const wantStream = req.url?.includes("stream=1") || req.headers.accept === "text/event-stream";
    console.log("[agent] /run received, stream=", wantStream);

    if (wantStream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // Сразу отправить комментарий, чтобы клиент не закрыл соединение до первого ответа ИИ
      try {
        if (!res.writableEnded && !res.destroyed) res.write(": connected\n\n");
      } catch {
        // ignore
      }
      const send = (event: string, data: unknown): void => {
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          } catch {
            // клиент отключился
          }
        }
      };
      const HEARTBEAT_INTERVAL_MS = 15_000;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      try {
        console.log("[agent] calling runAgent...");
        heartbeatTimer = setInterval(() => {
          if (!res.writableEnded && !res.destroyed) {
            try {
              res.write(": heartbeat\n\n");
            } catch {
              // ignore
            }
          }
        }, HEARTBEAT_INTERVAL_MS);
        const { result, logId } = await runAgent(parsed.prompt, {
          history: parsed.history,
          mode: parsed.mode,
          onStep: (step) => send("step", step),
          modelOverride: parsed.modelOverride,
          modelDisplayName: parsed.modelDisplayName,
          project: parsed.project,
          userAccount: parsed.userAccount,
          chatName: parsed.chatName,
          environment: parsed.environment,
          inputImages: parsed.inputImages,
          disableCache: parsed.disableCache,
          footerVersions: parsed.footerVersions,
          ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}),
        });
        send("done", { result, logId: logId ?? null });
        console.log("[agent] runAgent done");
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[agent] runAgent error:", message);
        send("error", { error: message });
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.end();
          } catch {
            // уже закрыто
          }
        }
      }
      return;
    }

    try {
      console.log("[agent] calling runAgent (no stream)...");
      const { result, steps, logId } = await runAgent(parsed.prompt, {
        history: parsed.history,
        mode: parsed.mode,
        modelOverride: parsed.modelOverride,
        modelDisplayName: parsed.modelDisplayName,
        project: parsed.project,
        userAccount: parsed.userAccount,
        chatName: parsed.chatName,
        environment: parsed.environment,
        inputImages: parsed.inputImages,
        disableCache: parsed.disableCache,
        footerVersions: parsed.footerVersions,
        ...(parsed.timeoutMs !== undefined ? { timeoutMs: parsed.timeoutMs } : {}),
      });
      console.log("[agent] runAgent done");
      safeEnd(res, 200, JSON.stringify({ result, steps: steps ?? [], logId: logId ?? null }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[agent] runAgent error:", message);
      safeEnd(res, 500, JSON.stringify({ error: "Internal error" }));
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[agent] handleRun", message);
    try {
      safeEnd(res, 500, JSON.stringify({ error: "Internal error" }));
    } catch {
      // клиент уже закрыл соединение — не падать
    }
  }
}

function main(): void {
  const config = getConfig();
  const port = config.serverPort;

  process.on("uncaughtException", (err) => {
    console.error("[agent] uncaughtException:", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[agent] unhandledRejection:", reason);
  });

  const server = createServer(async (req, res) => {
    try {
      const url = req.url?.split("?")[0];
      if (url === "/run") {
        await handleRun(req, res);
        return;
      }
      if (url === "/health" && req.method === "GET") {
        let version = "1.0.0";
        try {
          const root = join(dirname(fileURLToPath(import.meta.url)), "..");
          const vPath = join(root, "version.json");
          if (existsSync(vPath)) {
            const data = JSON.parse(readFileSync(vPath, "utf-8")) as { agent?: string };
            if (data.agent) version = data.agent;
          }
        } catch {
          /* ignore */
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", version }));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (err) {
      console.error("[agent] request handler error:", err);
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal error" }));
        } catch {
          // ignore
        }
      }
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(
        `[agent] Port ${port} is already in use (EADDRINUSE). Exiting to avoid restart loop. ` +
          "Убедитесь, что не запущен второй экземпляр агента или другой процесс, слушающий этот порт.",
      );
      process.exit(1);
    }
    console.error("[agent] HTTP server error:", err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`[agent] HTTP server listening on port ${port}`);
    console.log(`[agent] POST /run { "prompt": \"...\", \"history\": [...] } → result`);
    console.log(`[agent] GET http://127.0.0.1:${port}/health — проверка доступности`);
    if (config.apiKey) {
      console.log("[agent] API key required (Authorization: Bearer <key> or X-API-Key)");
    }
  });
}

main();
