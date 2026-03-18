/**
 * Тесты инструментов на реальных путях внутри репозитория (Этап 2.1).
 * Запуск из корня проекта: npx tsx agent/tools/tools.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { readFile, listDir, findFiles, grep, runCommand } from "./index.js";

describe("read_file", () => {
  it("читает файл из разрешённого каталога (package.json)", () => {
    const out = readFile("package.json");
    assert.strictEqual(out.ok, true);
    if (out.ok) {
      assert.ok(out.content.includes("komissionka"));
    }
  });

  it("читает prisma/schema.prisma", () => {
    const out = readFile("prisma/schema.prisma");
    assert.strictEqual(out.ok, true);
    if (out.ok) {
      assert.ok(out.content.includes("model") || out.content.includes("generator"));
    }
  });

  it("отклоняет путь вне allowlist", () => {
    const out = readFile("../../etc/passwd");
    assert.strictEqual(out.ok, false);
    if (!out.ok) assert.ok(out.error.length > 0);
  });

  it("возвращает ошибку для несуществующего файла", () => {
    const out = readFile("src/nonexistent.ts");
    assert.strictEqual(out.ok, false);
  });

  it("читает фрагмент файла по offset/limit (через прямой вызов read-file.ts)", async () => {
    const mod = await import("./read-file.js");
    const out = mod.readFile("telegram-bot/bot.ts", { offset_lines: 0, limit_lines: 5 });
    assert.strictEqual(out.ok, true);
    if (out.ok) {
      assert.ok(typeof out.startLine === "number" && typeof out.endLine === "number");
      assert.ok(out.content.length > 0);
    }
  });
});

describe("list_dir", () => {
  it("список корня (.)", () => {
    const out = listDir(".");
    assert.strictEqual(out.ok, true);
    if (out.ok) {
      assert.ok(Array.isArray(out.entries));
      assert.ok(out.entries.some((e) => e.name === "src" && e.type === "directory"));
    }
  });

  it("список src", () => {
    const out = listDir("src");
    assert.strictEqual(out.ok, true);
    if (out.ok) assert.ok(out.entries.length >= 0);
  });

  it("ошибка для несуществующего каталога", () => {
    const out = listDir("nonexistent_dir_xyz");
    assert.strictEqual(out.ok, false);
  });
});

describe("find_files", () => {
  it("маска prisma/*.prisma", () => {
    const out = findFiles("prisma/*.prisma");
    assert.strictEqual(out.ok, true);
    if (out.ok) {
      assert.ok(out.files.some((f) => f.endsWith("schema.prisma")));
    }
  });

  it("маска agent/**/*.ts", () => {
    const out = findFiles("agent/**/*.ts");
    assert.strictEqual(out.ok, true);
    if (out.ok) assert.ok(out.files.length >= 1);
  });

  it("отклоняет маску вне разрешённых каталогов", () => {
    const out = findFiles("node_modules/**/*");
    assert.strictEqual(out.ok, false);
  });
});

describe("grep", () => {
  it("поиск подстроки в prisma", () => {
    const out = grep("model", "prisma");
    assert.strictEqual(out.ok, true);
    if (out.ok) assert.ok(out.totalCount >= 0);
  });

  it("поиск по всему проекту (без path)", () => {
    const out = grep("read_file", undefined, { contextLines: 1 });
    assert.strictEqual(out.ok, true);
    if (out.ok) assert.ok(out.matches.length >= 0);
  });
});

describe("run_command", () => {
  it("отклоняет команду не из белого списка", async () => {
    const out = await runCommand("rm -rf /");
    assert.strictEqual(out.ok, false);
    if (!out.ok) assert.ok(out.error.startsWith("COMMAND_DISALLOWED:") && out.error.includes("rm -rf /"));
  });

  it("принимает npx prisma validate", async () => {
    const out = await runCommand("npx prisma validate");
    assert.strictEqual(out.ok, true);
    if (out.ok) assert.strictEqual(out.exitCode, 0);
  });

  it("принимает curl к localhost:3000 API", async () => {
    const out = await runCommand("curl -X POST http://localhost:3000/api/admin/testimonials");
    assert.strictEqual(out.ok, true);
  });

  it("принимает многострочный curl (нормализуется в одну строку)", async () => {
    const multiline = `curl -X POST http://localhost:3000/api/admin/news
-H "Content-Type: application/json"
-d '{"title":"Test"}'`;
    const out = await runCommand(multiline);
    assert.strictEqual(out.ok, true);
  });

  it("принимает npx prisma migrate dev", async () => {
    const out = await runCommand("npx prisma migrate dev --name test_allow");
    assert.strictEqual(out.ok, true);
  });
});
