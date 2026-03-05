/**
 * run_command(command, cwd?, timeout?) — безопасное выполнение разрешённой команды.
 * Белый список команд; без доступа к секретам из .env в окружении процесса.
 */

import { spawn } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "../config.js";
import { resolveAllowedDir, resolveAllowedPath } from "../path-safe.js";

/** Белый список: регулярное выражение или точное совпадение. Команда должна совпадать с одним из элементов. */
const ALLOWED_COMMANDS: ReadonlyArray<RegExp | string> = [
  // rm <path> — удаление файла в src/, agent/, prisma/, docs/, telegram-bot/ (проверяется отдельно)
  /^rm\s+[\w./\-]+\s*$/,
  /^npx\s+prisma\s+generate\s*$/,
  /^npx\s+prisma\s+validate\s*$/,
  /^npx\s+prisma\s+format\s*$/,
  /^npx\s+prisma\s+migrate\s+dev(\s+--name\s+\S+)?\s*$/,
  /^npx\s+prisma\s+migrate\s+reset(\s+--force)?\s*$/,
  /^npm\s+run\s+build\s*$/,
  /^npm\s+run\s+lint\s*$/,
  /^npm\s+run\s+dev\s*$/,
  /^npx\s+tsc\s+--noEmit\s*$/,
  /^npx\s+tsc\s+--noEmit\s+.*$/, // tsc --noEmit с доп. флагами
  // curl к API приложения (URL из AGENT_APP_URL, по умолчанию localhost:3000) — проверяется динамически
  "CURL_APP_API",
  // Резервное копирование и восстановление для режима Разработка
  /^npx\s+tsx\s+scripts\/agent-backup\.ts\s+backup\s+[\s\S]+$/,
  /^npx\s+tsx\s+scripts\/agent-backup\.ts\s+restore\s+backup-[a-z0-9-]+\s*$/i,
  // Обновление версий (версионность)
  /^npx\s+tsx\s+scripts\/version-bump\.ts\s+(app|agent|tgbot)\s+(major|minor|patch)\s*$/,
  // Перезапуск на сервере (PM2)
  /^pm2\s+restart\s+(komissionka|agent|bot)(\s+(komissionka|agent|bot))*\s*$/,
  // Подсчёт строк в core для отчёта о версионности
  /^npx\s+tsx\s+scripts\/count-core-lines\.ts\s*$/,
  // Запуск скриптов из scripts/ (seed, утилиты) — только безопасные имена [a-zA-Z0-9_-]+.ts
  /^npx\s+tsx\s+scripts\/[a-zA-Z0-9_-]+\.ts\s*$/,
];

/** URL приложения для curl (из конфига). */
function getAppUrlForReadable(): string {
  return getConfig().appUrl.replace(/\/$/, "");
}

/** Полный список разрешённых команд для системного промпта и описания инструмента (держать вручную в синхронизации с ALLOWED_COMMANDS). */
export function getAllowedCommandsReadable(): string {
  const appUrl = getAppUrlForReadable();
  return `rm <path> — удаление файла в src/, agent/, prisma/, docs/, telegram-bot/ (например: rm src/app/test/page.tsx)
npx prisma generate
npx prisma validate
npx prisma format
npx prisma migrate dev (и npx prisma migrate dev --name <имя>)
npx prisma migrate reset (и npx prisma migrate reset --force)
npm run build
npm run lint
npm run dev
npx tsc --noEmit (с опциональными флагами)
curl в любом виде к ${appUrl}/api/... (GET, POST, DELETE, с -H, -d и т.д.), в том числе:
  - curl ${appUrl}/api/admin/data (GET: список новостей, отзывов и др. с id)
  - curl -X POST ${appUrl}/api/admin/news (создание новостей)
  - curl -X POST ${appUrl}/api/admin/testimonials (создание отзывов с rating)
  - curl -X DELETE ${appUrl}/api/admin/news/<id> (удаление новости по id)
  - curl -X DELETE ${appUrl}/api/admin/testimonials/<id> (удаление отзыва по id)
npx tsx scripts/agent-backup.ts backup <path1> [path2 ...] — резервная копия файлов перед изменениями
npx tsx scripts/agent-backup.ts restore <backupId> — восстановление из бэкапа
npx tsx scripts/version-bump.ts <app|agent|tgbot> <major|minor|patch> — обновление версии компонента
pm2 restart komissionka agent bot — перезапуск служб на сервере (PM2)
npx tsx scripts/count-core-lines.ts — подсчёт строк в core (app, agent, tgbot) для отчёта о версионности
npx tsx scripts/<имя>.ts — запуск скриптов из scripts/ (например seed-five-users.ts, seed-demo.ts); имя файла — только латиница, цифры, дефис, подчёркивание
npx tsx scripts/cleanup-users-and-items.ts — удаление всех карточек товаров и пользователей, кроме bshevelev@mail.ru (режим разработка)`;
}
export const ALLOWED_COMMANDS_READABLE = getAllowedCommandsReadable();

/** Маркер в ответе run_command: выполнение прервано из‑за неразрешённой команды (для досрочного выхода в core). */
export const RUN_COMMAND_DISALLOWED_PREFIX = "[run_command] error: COMMAND_DISALLOWED:";

/** Запрещённые символы (инъекция команд). */
const DANGEROUS_CHARS = /[;&|`$\\]/;
/** Для curl к AGENT_APP_URL/api/ разрешаем обратный слэш (JSON в -d), остальное — как выше. */
const DANGEROUS_CHARS_CURL_LOCALHOST = /[;&|`$]/;

/** Сводит команду к одной строке (многострочный curl и т.п. → одна строка с пробелами). */
function normalizeCommandLine(command: string): string {
  return command.trim().replace(/\s+/g, " ").trim();
}

function isCurlToAppUrl(command: string, appUrl: string): boolean {
  const base = appUrl.replace(/\/$/, "");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^curl\\s+.*${escaped}\\/api\\/[^\\s;&|\`$\\\\]+`).test(command);
}

function isAllowed(command: string): boolean {
  const normalized = normalizeCommandLine(command);
  const appUrl = getConfig().appUrl.replace(/\/$/, "");
  const isCurlApp = isCurlToAppUrl(normalized, appUrl);
  const dangerous = isCurlApp ? DANGEROUS_CHARS_CURL_LOCALHOST : DANGEROUS_CHARS;
  if (dangerous.test(normalized)) return false;
  return ALLOWED_COMMANDS.some((allowed) => {
    if (allowed === "CURL_APP_API") return isCurlApp;
    return typeof allowed === "string" ? allowed === normalized : allowed.test(normalized);
  });
}

export interface RunCommandResult {
  ok: true;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunCommandError {
  ok: false;
  error: string;
}

export type RunCommandOutput = RunCommandResult | RunCommandError;

/** Убирает из stderr вывод curl о прогрессе (Total, Received, Dload, Speed и т.д.), оставляя реальные ошибки. */
function stripCurlProgressStderr(stderr: string): string {
  const lines = stderr.trim().split("\n");
  const filtered = lines.filter(
    (line) =>
      !/^\s*% Total\s/.test(line) &&
      !/^\s*\d+\s+\d+\s+\d+\s+\d+/.test(line) &&
      !/Dload\s+Upload\s+Total\s+Spent\s+Left\s+Speed/.test(line) &&
      !/^\s*-\+?-+\s*-+\s*-+\s*-+\s*-+\s*-+\s*-+\s*-+\s*-+/.test(line)
  );
  return filtered.join("\n").trim();
}

/**
 * Выполняет команду из белого списка. cwd — относительно корня; timeout — в мс.
 * Окружение процесса не содержит переменных из .env (только безопасные системные).
 */
export function runCommand(
  command: string,
  cwdArg?: string,
  timeoutMs?: number
): Promise<RunCommandOutput> {
  const { root, timeoutMs: configTimeout } = getConfig();
  const normalizedCommand = normalizeCommandLine(command);
  if (!isAllowed(command)) {
    return Promise.resolve({
      ok: false,
      error: "COMMAND_DISALLOWED:" + normalizedCommand,
    });
  }

  // rm: отдельная проверка пути и выполнение через Node (кроссплатформенно)
  const rmMatch = /^rm\s+([\w./\-]+)\s*$/.exec(normalizedCommand);
  if (rmMatch) {
    const pathArg = rmMatch[1]!.trim();
    const resolved = resolveAllowedPath(root, pathArg);
    if (!resolved) {
      return Promise.resolve({
        ok: false,
        error: "COMMAND_DISALLOWED:rm (путь вне разрешённых каталогов): " + pathArg,
      });
    }
    try {
      if (!existsSync(resolved)) {
        return Promise.resolve({
          ok: false,
          error: "Файл не найден: " + pathArg,
        });
      }
      unlinkSync(resolved);
      return Promise.resolve({
        ok: true,
        stdout: `Файл удалён: ${pathArg}`,
        stderr: "",
        exitCode: 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Promise.resolve({
        ok: false,
        error: "Ошибка удаления: " + msg,
      });
    }
  }

  const cwd = cwdArg ? resolveAllowedDir(root, cwdArg) : root;
  if (!cwd) {
    return Promise.resolve({
      ok: false,
      error: "Указанная рабочая директория не разрешена.",
    });
  }

  const timeout = timeoutMs ?? configTimeout;
  const safeEnv: Record<string, string> = {};
  const skipKeys = new Set(["DATABASE_URL", "AGENT_LLM_API_KEY", "NEXTAUTH_SECRET", "NEXTAUTH_URL"]);
  const isPrismaCommand = /^npx\s+prisma\s+/.test(normalizedCommand);
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (skipKeys.has(k) || k.startsWith("AGENT_")) continue;
    safeEnv[k] = v;
  }
  if (isPrismaCommand && process.env.DATABASE_URL) safeEnv.DATABASE_URL = process.env.DATABASE_URL;
  safeEnv.NODE_ENV = process.env.NODE_ENV ?? "production";

  // Для curl к приложению (AGENT_APP_URL) подставляем заголовок авторизации агента
  let cmd = normalizedCommand;
  const appUrl = getConfig().appUrl.replace(/\/$/, "");
  const isCurlApp = isCurlToAppUrl(normalizedCommand, appUrl);
  const apiKey = getConfig().apiKey;
  if (isCurlApp && apiKey) {
    const safeKey = apiKey.replace(/"/g, "");
    cmd = `curl -H "X-Agent-API-Key: ${safeKey}" ${normalizedCommand.slice(5).trim()}`;
  }
  // На Windows консоль по умолчанию не UTF-8 — кириллица в теле curl теряется. Включаем код 65001 для процесса.
  if (process.platform === "win32") {
    cmd = `chcp 65001 >nul 2>nul && ${cmd}`;
  }

  // Для curl к localhost: при -d '...' или -d "..." тело на Windows/внешнем контексте может искажаться. Пишем JSON во временный файл и подставляем -d @path.
  let tmpFileToDelete: string | null = null;
  const singleQuotedData = cmd.match(/-d\s+'((?:[^'\\]|\\.)*)'/);
  if (isCurlApp && singleQuotedData) {
    try {
      const body = singleQuotedData[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
      const tmpDir = join(root, ".agent-tmp");
      mkdirSync(tmpDir, { recursive: true });
      const tmpFile = join(tmpDir, `body-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.json`);
      writeFileSync(tmpFile, body, "utf8");
      tmpFileToDelete = tmpFile;
      const atPath = tmpFile.replace(/\\/g, "/");
      cmd = cmd.replace(/-d\s+'((?:[^'\\]|\\.)*)'/, `-d @${atPath}`);
    } catch {
      // не удалось — выполняем команду как есть
    }
  }
  // То же для -d "..." (двойные кавычки с экранированием \") — модель иногда шлёт такой формат из внешнего браузера.
  const doubleQuotedData = !tmpFileToDelete && isCurlApp && cmd.match(/-d\s+"((?:[^"\\]|\\.)*)"/);
  if (doubleQuotedData) {
    try {
      const body = doubleQuotedData[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const tmpDir = join(root, ".agent-tmp");
      mkdirSync(tmpDir, { recursive: true });
      const tmpFile = join(tmpDir, `body-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.json`);
      writeFileSync(tmpFile, body, "utf8");
      tmpFileToDelete = tmpFile;
      const atPath = tmpFile.replace(/\\/g, "/");
      cmd = cmd.replace(/-d\s+"((?:[^"\\]|\\.)*)"/, `-d @${atPath}`);
    } catch {
      // не удалось — выполняем команду как есть
    }
  }

  return new Promise((resolve) => {
    const child = spawn(cmd, [], {
      cwd,
      shell: true,
      env: safeEnv as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        ok: false,
        error: `Таймаут (${timeout} мс) превышен.`,
      });
    }, timeout);

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (tmpFileToDelete) {
        try {
          unlinkSync(tmpFileToDelete);
        } catch {
          // ignore
        }
      }
      if (signal && code === null) {
        resolve({ ok: false, error: `Процесс завершён по сигналу: ${signal}.` });
        return;
      }
      const errOut = isCurlApp ? stripCurlProgressStderr(stderr) : stderr.trim();
      resolve({
        ok: true,
        stdout: stdout.trim(),
        stderr: errOut,
        exitCode: code ?? -1,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}
