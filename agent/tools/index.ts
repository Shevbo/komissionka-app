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
import {
  backlogList,
  backlogCreate,
  backlogUpdate,
  backlogDelete,
} from "./backlog-api.js";

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
      const offset_lines = typeof args.offset_lines === "number" ? (args.offset_lines as number) : undefined;
      const limit_lines = typeof args.limit_lines === "number" ? (args.limit_lines as number) : undefined;
      const out = readFile(path, { offset_lines, limit_lines });
      return Promise.resolve(
        out.ok
          ? `[read_file]\npath: ${out.path}${
              typeof out.startLine === "number" && typeof out.endLine === "number"
                ? `\nlines: ${out.startLine}-${out.endLine}`
                : ""
            }\ncontent:\n${out.content}`
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
    case "read_docs_file": {
      const path = args.path as string;
      const normPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!normPath.startsWith("docs/")) {
        return Promise.resolve(
          `[read_docs_file] error: В режиме «курилка» можно читать только файлы в папке docs/. Путь должен начинаться с docs/ (например docs/FAQ.md).`
        );
      }
      const out = readFile(normPath);
      return Promise.resolve(
        out.ok
          ? `[read_docs_file]\npath: ${out.path}\ncontent:\n${out.content}`
          : `[read_docs_file] error: ${out.error}`
      );
    }
    case "get_agent_info": {
      const cfg = getConfig();
      const provider = cfg.llmBaseUrl?.includes("generativelanguage") ? "Google Gemini" : cfg.llmBaseUrl ? "custom" : "OpenAI-compatible";
      return Promise.resolve(
        `[get_agent_info]\nmodel: ${cfg.llmModel ?? "not set"}\nprovider: ${provider}`
      );
    }
    case "backlog": {
      const action = (args.action as string) ?? "list";
      if (action === "list") {
        return backlogList().then((r) =>
          r.ok
            ? `[backlog] ${r.message}\n${JSON.stringify(r.data, null, 2)}`
            : `[backlog] error: ${r.message}`
        );
      }
      if (action === "create") {
        const body = args.body as Record<string, unknown> | undefined;
        if (!body || typeof body.short_description !== "string" || !body.short_description.trim()) {
          return Promise.resolve("[backlog] error: short_description обязателен для create");
        }
        return backlogCreate({
          order_num: body.order_num != null ? Number(body.order_num) : null,
          sprint_number: typeof body.sprint_number === "number" ? body.sprint_number : Number(body.sprint_number) || 1,
          sprint_status: (body.sprint_status as string) ?? "формируется",
          short_description: String(body.short_description).trim(),
          description_prompt: typeof body.description_prompt === "string" ? body.description_prompt : "",
          task_status: (body.task_status as string) ?? "не начато",
          doc_link: body.doc_link != null && body.doc_link !== "" ? String(body.doc_link) : null,
          test_order_or_link: body.test_order_or_link != null && body.test_order_or_link !== "" ? String(body.test_order_or_link) : null,
        }).then((r) =>
          r.ok ? `[backlog] ${r.message}` : `[backlog] error: ${r.message}`
        );
      }
      if (action === "update") {
        const id = args.id as string;
        const body = args.body as Record<string, unknown> | undefined;
        if (!id) return Promise.resolve("[backlog] error: id обязателен для update");
        const payload: Record<string, unknown> = {};
        if (body?.order_num !== undefined) payload.order_num = body.order_num;
        if (body?.sprint_number !== undefined) payload.sprint_number = body.sprint_number;
        if (body?.sprint_status !== undefined) payload.sprint_status = body.sprint_status;
        if (body?.short_description !== undefined) payload.short_description = body.short_description;
        if (body?.description_prompt !== undefined) payload.description_prompt = body.description_prompt;
        if (body?.task_status !== undefined) payload.task_status = body.task_status;
        if (body?.doc_link !== undefined) payload.doc_link = body.doc_link;
        if (body?.test_order_or_link !== undefined) payload.test_order_or_link = body.test_order_or_link;
        return backlogUpdate(id, payload).then((r) =>
          r.ok ? `[backlog] ${r.message}` : `[backlog] error: ${r.message}`
        );
      }
      if (action === "delete") {
        const id = args.id as string;
        if (!id) return Promise.resolve("[backlog] error: id обязателен для delete");
        return backlogDelete(id).then((r) =>
          r.ok ? `[backlog] ${r.message}` : `[backlog] error: ${r.message}`
        );
      }
      return Promise.resolve("[backlog] error: action должен быть list | create | update | delete");
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

/** Бэклог: чтение и запись во всех режимах. Таблица backlog в БД, дубликат в docs/backlog.md. */
const BACKLOG_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "backlog",
    description:
      "Читать и изменять бэклог хотелок (таблица backlog в БД, дубликат в docs/backlog.md). Доступно во всех режимах. action: list — список записей; create — новая запись (body: short_description обязательно, sprint_number, sprint_status, description_prompt, task_status и др.); update — обновить по id (body: поля для изменения); delete — удалить по id.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "list | create | update | delete" },
        id: { type: "string", description: "id записи (для update и delete)" },
        body: {
          type: "object",
          description:
            "Для create: short_description (обяз.), sprint_number, sprint_status, description_prompt, task_status, doc_link, test_order_or_link, order_num. Для update: те же поля. Статусы спринта: формируется, выполняется, реализован, архив. Статусы задачи: не начато, выполняется, тестируется, сделано, отказ.",
        },
      },
      required: ["action"],
    },
  },
};

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
        "Прочитать содержимое файла по пути относительно корня репозитория. Разрешены каталоги: src/, prisma/, docs/, agent/, public/ и корневые конфиги (package.json, tsconfig.json и т.д.). Для больших файлов используйте offset_lines/limit_lines, чтобы прочитать только нужный фрагмент и экономить токены.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Путь к файлу относительно корня (например, src/app/page.tsx, prisma/schema.prisma).",
          },
          offset_lines: {
            type: "number",
            description: "Сколько строк пропустить с начала (0 = читать с первой строки).",
          },
          limit_lines: {
            type: "number",
            description: "Сколько строк прочитать (по умолчанию 200, если offset_lines задан).",
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
  BACKLOG_TOOL,
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

/** read_file только для docs/ — для режима «курилка» (показ документов в чате). */
const READ_DOCS_FILE: ToolDefinition = {
  type: "function",
  function: {
    name: "read_docs_file",
    description:
      "Прочитать содержимое файла в папке docs и вывести его в ответе. Используй, когда пользователь просит показать документ или инструкцию в чате. Путь должен начинаться с docs/ (например docs/TELEGRAM-BOT-VARIANT-C-STAGES.md).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Путь к файлу в docs/ (например docs/FAQ.md)." },
      },
      required: ["path"],
    },
  },
};

/** Режим «курилка»: get_agent_info + read_docs_file/write_docs_file + backlog. */
export const TOOLS_CHAT: ToolDefinition[] = [
  ...TOOLS_FOR_LLM.filter((t) => t.function.name === "get_agent_info"),
  READ_DOCS_FILE,
  WRITE_DOCS_FILE,
  BACKLOG_TOOL,
];

/** Чтение и поиск без write_file/run_command — режим «консультация». BACKLOG_TOOL уже включён в TOOLS_FOR_LLM. */
export const TOOLS_CONSULT: ToolDefinition[] = [
  ...TOOLS_FOR_LLM.filter((t) => !["write_file", "run_command"].includes(t.function.name)),
];
