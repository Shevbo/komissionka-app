/**
 * Инструменты агента (Этап 2). Экспорт функций и описаний для LLM.
 */

import { getConfig } from "../config.js";
import { readFile } from "./read-file.js";
import { writeFile } from "./write-file.js";
import { listDir } from "./list-dir.js";
import { findFiles } from "./find-files.js";
import { grep } from "./grep.js";
import { runCommand, RUN_COMMAND_DISALLOWED_PREFIX, getAllowedCommandsReadable } from "./run-command.js";

export { readFile } from "./read-file.js";
export type { ReadFileOutput } from "./read-file.js";
export { writeFile } from "./write-file.js";
export type { WriteFileOutput } from "./write-file.js";

export { listDir } from "./list-dir.js";
export type { ListDirOutput } from "./list-dir.js";

export { findFiles } from "./find-files.js";
export type { FindFilesOutput } from "./find-files.js";

export { grep } from "./grep.js";
export type { GrepOutput, GrepOptions } from "./grep.js";

export { runCommand, RUN_COMMAND_DISALLOWED_PREFIX } from "./run-command.js";
export type { RunCommandOutput } from "./run-command.js";

/**
 * Выполняет вызов инструмента по имени и аргументам. Возвращает текстовый результат для вставки в контекст LLM.
 */
export function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "read_file": {
      const path = args.path as string;
      const out = readFile(path);
      return Promise.resolve(
        out.ok
          ? `[read_file]\npath: ${out.path}\ncontent:\n${out.content}`
          : `[read_file] error: ${out.error}`
      );
    }
    case "write_file": {
      const path = args.path as string;
      const content = typeof args.content === "string" ? args.content : "";
      const writeOut = writeFile(path, content);
      return Promise.resolve(
        writeOut.ok
          ? `[write_file] path: ${writeOut.path}\n${writeOut.message}`
          : `[write_file] error: ${writeOut.error}`
      );
    }
    case "list_dir": {
      const path = (args.path as string) ?? ".";
      const out = listDir(path);
      return Promise.resolve(
        out.ok
          ? `[list_dir] path: ${out.path}\nentries:\n${out.entries.map((e) => `  ${e.type}: ${e.name}`).join("\n")}`
          : `[list_dir] error: ${out.error}`
      );
    }
    case "find_files": {
      const pattern = args.pattern as string;
      const out = findFiles(pattern);
      return Promise.resolve(
        out.ok
          ? `[find_files] pattern: ${out.pattern}\nfiles (${out.files.length}):\n${out.files.map((f) => `  ${f}`).join("\n")}`
          : `[find_files] error: ${out.error}`
      );
    }
    case "grep": {
      const search_string = args.search_string as string;
      const path = args.path as string | undefined;
      const context_lines = args.context_lines as number | undefined;
      const use_regex = args.use_regex as boolean | undefined;
      const out = grep(search_string, path, {
        contextLines: context_lines,
        useRegex: use_regex,
      });
      if (!out.ok) return Promise.resolve(`[grep] error: ${out.error}`);
      const lines = out.matches.slice(0, 50).map(
        (m) =>
          `${m.file}:${m.lineNumber}: ${m.line}\n  before: ${m.contextBefore.join(" | ")}\n  after: ${m.contextAfter.join(" | ")}`
      );
      return Promise.resolve(
        `[grep] total: ${out.totalCount}\n${lines.join("\n")}`
      );
    }
    case "run_command": {
      const command = args.command as string;
      const cwd = args.cwd as string | undefined;
      const timeout_ms = args.timeout_ms as number | undefined;
      return runCommand(command, cwd, timeout_ms).then((res) => {
        if (res.ok) {
          return `[run_command] exitCode: ${res.exitCode}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`;
        }
        if (res.error.startsWith("COMMAND_DISALLOWED:")) {
          const attemptedCmd = res.error.slice("COMMAND_DISALLOWED:".length).trim();
          return `${RUN_COMMAND_DISALLOWED_PREFIX}${attemptedCmd}\n\nКоманда не входит в белый список. Для реализации добавьте её в agent/tools/run-command.ts (ALLOWED_COMMANDS) и перезапустите агента.`;
        }
        return `[run_command] error: ${res.error}`;
      });
    }
    case "write_docs_file": {
      const path = args.path as string;
      const normPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!normPath.startsWith("docs/")) {
        return Promise.resolve(
          `[write_docs_file] error: В режиме «курилка» разрешена запись только в папку docs/. Путь должен начинаться с docs/ (например docs/инструкция.md).`
        );
      }
      const content = typeof args.content === "string" ? args.content : "";
      const writeOut = writeFile(normPath, content);
      return Promise.resolve(
        writeOut.ok
          ? `[write_docs_file] path: ${writeOut.path}\n${writeOut.message}`
          : `[write_docs_file] error: ${writeOut.error}`
      );
    }
    case "get_agent_info": {
      const cfg = getConfig();
      const provider = cfg.llmBaseUrl?.includes("generativelanguage") ? "Google Gemini" : cfg.llmBaseUrl ? "custom" : "OpenAI-compatible";
      return Promise.resolve(
        `[get_agent_info]\nmodel: ${cfg.llmModel ?? "not set"}\nprovider: ${provider}`
      );
    }
    default:
      return Promise.resolve(`[unknown tool] ${name}`);
  }
}

/** Описание инструмента в формате OpenAI function calling (и совместимых API). */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
}

export const TOOLS_FOR_LLM: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_agent_info",
      description:
        "Узнать сведения об агенте: текущая модель LLM и провайдер. Без параметров. Используй для вопросов «какая модель», «выведи версию LLM» — один вызов даёт ответ; не ищи по коду и не читай .env.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Прочитать содержимое файла по пути относительно корня репозитория. Разрешены каталоги: src/, prisma/, docs/, agent/, public/ и корневые конфиги (package.json, tsconfig.json и т.д.).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Путь к файлу относительно корня (например, src/app/page.tsx, prisma/schema.prisma).",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Записать или перезаписать файл по пути относительно корня. Разрешены те же каталоги, что и для read_file (src/, prisma/, docs/, agent/, public/ и корневые конфиги). Используй для внесения изменений в код по запросу пользователя.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Путь к файлу относительно корня (например, src/app/page.tsx).",
          },
          content: {
            type: "string",
            description: "Полное содержимое файла для записи.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "Список файлов и папок в каталоге (без рекурсии). Путь относительно корня; разрешены те же каталоги, что и для read_file.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Путь к каталогу (например, src, prisma, docs). По умолчанию — корень.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_files",
      description:
        "Поиск файлов по маске во всех каталогах: src, prisma, docs, agent, public, telegram-bot, scripts, .cursor. Поддерживаются * и **. Примеры: **/*.ts, scripts/**/*.ts, .cursor/**/*.mdc.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Маска поиска (например, **/*.ts, prisma/*.prisma).",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "Поиск по тексту во всех каталогах репозитория (src, prisma, docs, agent, public, telegram-bot, scripts, .cursor). Без path — поиск по всем. Возвращает совпадения с контекстом.",
      parameters: {
        type: "object",
        properties: {
          search_string: {
            type: "string",
            description: "Строка или регулярное выражение для поиска.",
          },
          path: {
            type: "string",
            description: "Путь к каталогу или файлу (опционально). Без указания — поиск по всем разрешённым каталогам.",
          },
          context_lines: {
            type: "number",
            description: "Количество строк контекста до и после совпадения. По умолчанию 2.",
          },
          use_regex: {
            type: "boolean",
            description: "Интерпретировать search_string как регулярное выражение. По умолчанию false.",
          },
        },
        required: ["search_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        `Выполнить разрешённую команду в корне проекта. Полный список (выполняй САМ, не проси пользователя):\n${getAllowedCommandsReadable()}\nВ белый список входят: GET ${getConfig().appUrl.replace(/\/$/, "")}/api/admin/data (список с id), POST /api/admin/news и /api/admin/testimonials (создание), DELETE /api/admin/news/<id> и /api/admin/testimonials/<id> (удаление). При запросе «удали все новости и отзывы, создай новые»: (1) вызови run_command с GET /api/admin/data; (2) для каждого id из news — run_command с DELETE /api/admin/news/<id>; (3) для каждого id из testimonials — run_command с DELETE /api/admin/testimonials/<id>; (4) для каждой новой новости — run_command с POST /api/admin/news; (5) для каждого нового отзыва — run_command с POST /api/admin/testimonials. Не сообщай об удалении или создании, пока не выполнишь все эти вызовы и не получишь ответы. Неразрешённые команды не выполняются — в чат выводится подсказка, запрос останавливается.`,
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Команда целиком (например, npx prisma generate).",
          },
          cwd: {
            type: "string",
            description: "Рабочая директория относительно корня (опционально).",
          },
          timeout_ms: {
            type: "number",
            description: "Таймаут в миллисекундах (опционально).",
          },
        },
        required: ["command"],
      },
    },
  },
];

/** write_file только для docs/ — для режима «курилка» (документация/инструкции). */
const WRITE_DOCS_FILE: ToolDefinition = {
  type: "function",
  function: {
    name: "write_docs_file",
    description:
      "Создать или обновить файл с документацией/инструкцией в папке docs. Единственная разрешённая в режиме «курилка» операция записи. Путь должен начинаться с docs/ (например docs/инструкция.md).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Путь к файлу в docs/ (например docs/FAQ.md)." },
        content: { type: "string", description: "Содержимое файла." },
      },
      required: ["path", "content"],
    },
  },
};

/** Режим «курилка»: get_agent_info + write_docs_file (только docs). */
export const TOOLS_CHAT: ToolDefinition[] = [
  ...TOOLS_FOR_LLM.filter((t) => t.function.name === "get_agent_info"),
  WRITE_DOCS_FILE,
];

/** Чтение и поиск без записи и команд — режим «консультация». */
export const TOOLS_CONSULT: ToolDefinition[] = TOOLS_FOR_LLM.filter(
  (t) => !["write_file", "run_command"].includes(t.function.name)
);
