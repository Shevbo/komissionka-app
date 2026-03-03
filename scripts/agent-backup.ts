#!/usr/bin/env npx tsx
/**
 * Резервное копирование и восстановление для режима «Разработка» агента.
 * Вызов: npx tsx scripts/agent-backup.ts backup <path1> [path2 ...]
 *        npx tsx scripts/agent-backup.ts restore <backupId>
 *
 * Используется агентом перед внесением изменений в код/данные.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = join(ROOT, ".agent-backup");

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "backup") {
    const paths = args.slice(1).filter(Boolean);
    if (paths.length === 0) {
      console.error("Usage: npx tsx scripts/agent-backup.ts backup <path1> [path2 ...]");
      process.exit(1);
    }
    const backupId = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const targetDir = join(BACKUP_DIR, backupId);
    mkdirSync(targetDir, { recursive: true });

    const manifest: string[] = [];
    for (const p of paths) {
      const fullPath = resolve(ROOT, p.replace(/^\//, ""));
      if (!fullPath.startsWith(ROOT) || !existsSync(fullPath)) continue;
      const stat = statSync(fullPath);
      if (stat.isFile()) {
        const rel = fullPath.slice(ROOT.length).replace(/^[/\\]/, "") || "root";
        const targetPath = join(targetDir, rel);
        mkdirSync(dirname(targetPath), { recursive: true });
        copyFileSync(fullPath, targetPath);
        manifest.push(rel);
      } else if (stat.isDirectory()) {
        const files = collectFiles(fullPath, ROOT);
        for (const f of files) {
          const targetPath = join(targetDir, f);
          mkdirSync(dirname(targetPath), { recursive: true });
          copyFileSync(join(ROOT, f), join(targetDir, f));
          manifest.push(f);
        }
      }
    }

    writeFileSync(join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
    console.log(JSON.stringify({ ok: true, backupId, count: manifest.length }));
  } else if (cmd === "restore") {
    const backupId = args[1];
    if (!backupId || !/^backup-[a-z0-9-]+$/i.test(backupId)) {
      console.error("Usage: npx tsx scripts/agent-backup.ts restore <backupId>");
      process.exit(1);
    }
    const targetDir = join(BACKUP_DIR, backupId);
    if (!existsSync(targetDir)) {
      console.error(JSON.stringify({ ok: false, error: "Backup not found" }));
      process.exit(1);
    }
    const manifestPath = join(targetDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      console.error(JSON.stringify({ ok: false, error: "Invalid backup" }));
      process.exit(1);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as string[];
    for (const rel of manifest) {
      const src = join(targetDir, rel);
      const dst = join(ROOT, rel);
      if (existsSync(src)) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
      }
    }
    console.log(JSON.stringify({ ok: true, restored: manifest.length }));
  } else {
    console.error("Usage: npx tsx scripts/agent-backup.ts backup|restore [args]");
    process.exit(1);
  }
}

function collectFiles(dir: string, root: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = full.slice(root.length).replace(/^[/\\]/, "");
    if (e.isFile()) out.push(rel);
    else if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
      out.push(...collectFiles(full, root));
    }
  }
  return out;
}

main();
