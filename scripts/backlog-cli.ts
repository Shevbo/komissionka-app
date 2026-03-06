/**
 * CLI для работы с таблицей backlog через Prisma.
 *
 * Запуск (из корня проекта):
 *   npx tsx scripts/backlog-cli.ts list
 *   npx tsx scripts/backlog-cli.ts get <id>
 *   npx tsx scripts/backlog-cli.ts create --short "..." --prompt "..." --sprint 1 --sprintStatus "формируется" --taskStatus "не начато"
 *   npx tsx scripts/backlog-cli.ts update <id> --taskStatus "выполняется"
 *   npx tsx scripts/backlog-cli.ts delete <id>
 *
 * Используется агентом и Cursor для чтения/изменения бэклога без доступа к UI.
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const SPRINT_STATUSES = ["формируется", "выполняется", "реализован", "архив"] as const;
const TASK_STATUSES = ["не начато", "выполняется", "тестируется", "сделано", "отказ"] as const;

type SprintStatus = (typeof SPRINT_STATUSES)[number];
type TaskStatus = (typeof TASK_STATUSES)[number];

type Args = {
  _: string[];
  [key: string]: string | number | undefined | string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=");
      let key: string;
      let value: string | undefined;
      if (eqIdx >= 0) {
        key = token.slice(2, eqIdx);
        value = token.slice(eqIdx + 1);
      } else {
        key = token.slice(2);
        value = argv[i + 1];
        if (value && value.startsWith("--")) {
          value = undefined;
        } else if (value !== undefined) {
          i++;
        }
      }
      if (value === undefined) value = "true";
      const prev = args[key];
      if (prev === undefined) {
        args[key] = value;
      } else if (Array.isArray(prev)) {
        (prev as string[]).push(value);
      } else {
        args[key] = [String(prev), value];
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function asInt(value: string | number | undefined, fallback: number | null = null): number | null {
  if (value === undefined) return fallback;
  const n = typeof value === "number" ? value : parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return n;
}

function validateSprintStatus(raw: unknown): SprintStatus {
  const s = String(raw ?? "").trim() as SprintStatus;
  if (!SPRINT_STATUSES.includes(s)) {
    throw new Error(`sprintStatus must be one of: ${SPRINT_STATUSES.join(", ")}`);
  }
  return s;
}

function validateTaskStatus(raw: unknown): TaskStatus {
  const s = String(raw ?? "").trim() as TaskStatus;
  if (!TASK_STATUSES.includes(s)) {
    throw new Error(`taskStatus must be one of: ${TASK_STATUSES.join(", ")}`);
  }
  return s;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || ["-h", "--help"].includes(cmd)) {
    console.log(
      [
        "Usage:",
        "  backlog-cli.ts list",
        "  backlog-cli.ts get <id>",
        "  backlog-cli.ts create --short \"...\" --prompt \"...\" [--sprint N] [--sprintStatus S] [--taskStatus T] [--order N] [--doc URL] [--test TEXT]",
        "  backlog-cli.ts update <id> [--short \"...\"] [--prompt \"...\"] [--sprint N] [--sprintStatus S] [--taskStatus T] [--order N] [--doc URL] [--test TEXT]",
        "  backlog-cli.ts delete <id>",
      ].join("\n")
    );
    return;
  }

  const args = parseArgs(rest);

  if (cmd === "list") {
    const rows = await prisma.backlog.findMany({
      orderBy: [{ order_num: "asc" }, { created_at: "desc" }],
    });
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (cmd === "get") {
    const id = args._[0];
    if (!id) throw new Error("get requires <id>");
    const row = await prisma.backlog.findUnique({ where: { id } });
    if (!row) {
      console.error(`Backlog item not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(row, null, 2));
    return;
  }

  if (cmd === "create") {
    const short = args.short ?? args.s ?? args.summary;
    const prompt = args.prompt ?? args.p ?? args.description ?? "";
    if (!short || String(short).trim() === "") {
      throw new Error("create requires --short \"краткое описание\"");
    }
    const sprintNumber = asInt((args.sprint ?? args.sprint_number) as string | number | undefined, 1);
    if (sprintNumber === null || sprintNumber < 0) {
      throw new Error("sprint must be a number >= 0");
    }
    const sprintStatus = validateSprintStatus(args.sprintStatus ?? args.sprint_status ?? "формируется");
    const taskStatus = validateTaskStatus(args.taskStatus ?? args.task_status ?? "не начато");
    const orderNum = asInt((args.order ?? args.order_num) as string | number | undefined, null);
    const docLinkRaw = (args.doc ?? args.doc_link) as string | undefined;
    const testRaw = (args.test ?? args.test_order ?? args.test_order_or_link) as string | undefined;

    const created = await prisma.backlog.create({
      data: {
        order_num: orderNum,
        sprint_number: sprintNumber,
        sprint_status: sprintStatus,
        short_description: String(short).trim(),
        description_prompt: String(prompt ?? ""),
        task_status: taskStatus,
        doc_link: docLinkRaw ? docLinkRaw.trim() : null,
        test_order_or_link: testRaw ? testRaw.trim() : null,
      },
    });
    console.log(JSON.stringify(created, null, 2));
    return;
  }

  if (cmd === "update") {
    const id = args._[0];
    if (!id) throw new Error("update requires <id>");
    const data: Record<string, unknown> = {};

    if (args.short ?? args.s ?? args.summary) {
      data.short_description = String(args.short ?? args.s ?? args.summary).trim();
    }
    if (args.prompt ?? args.p ?? args.description) {
      data.description_prompt = String(args.prompt ?? args.p ?? args.description);
    }
    if (args.sprint ?? args.sprint_number) {
      const n = asInt((args.sprint ?? args.sprint_number) as string | number | undefined, null);
      if (n !== null && n >= 0) data.sprint_number = n;
    }
    if (args.sprintStatus ?? args.sprint_status) {
      data.sprint_status = validateSprintStatus(args.sprintStatus ?? args.sprint_status);
    }
    if (args.taskStatus ?? args.task_status) {
      data.task_status = validateTaskStatus(args.taskStatus ?? args.task_status);
      data.status_changed_at = new Date();
    }
    if (args.order ?? args.order_num) {
      const n = asInt((args.order ?? args.order_num) as string | number | undefined, null);
      data.order_num = n;
    }
    if (args.doc ?? args.doc_link) {
      const v = String(args.doc ?? args.doc_link);
      data.doc_link = v === "" ? null : v.trim();
    }
    if (args.test ?? args.test_order ?? args.test_order_or_link) {
      const v = String(args.test ?? args.test_order ?? args.test_order_or_link);
      data.test_order_or_link = v === "" ? null : v.trim();
    }

    if (Object.keys(data).length === 0) {
      console.error("Nothing to update");
      process.exitCode = 1;
      return;
    }

    const updated = await prisma.backlog.update({ where: { id }, data });
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (cmd === "delete") {
    const id = args._[0];
    if (!id) throw new Error("delete requires <id>");
    await prisma.backlog.delete({ where: { id } });
    console.log(`Deleted backlog item: ${id}`);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

