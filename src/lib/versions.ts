/**
 * Версии приложения, агента и телеграм-бота (X.Y.Z).
 * Читаются из version.json в корне проекта.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let cached: { app: string; agent: string; tgbot: string } | null = null;

function loadVersions(): { app: string; agent: string; tgbot: string } {
  if (cached) return cached;
  const root = process.cwd();
  const path = join(root, "version.json");
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      const data = JSON.parse(raw) as { app?: string; agent?: string; tgbot?: string };
      cached = {
        app: data.app ?? "1.0.0",
        agent: data.agent ?? "1.0.0",
        tgbot: data.tgbot ?? "1.0.0",
      };
      return cached;
    } catch {
      // fallthrough
    }
  }
  cached = { app: "1.0.0", agent: "1.0.0", tgbot: "1.0.0" };
  return cached;
}

export function getAppVersion(): string {
  return loadVersions().app;
}

export function getAgentVersion(): string {
  return loadVersions().agent;
}

export function getTgbotVersion(): string {
  return loadVersions().tgbot;
}

/** Строка для отображения: "app v1.0.0; agent v1.0.0; tgbot v1.0.0" */
export function getVersionsString(): string {
  const v = loadVersions();
  return `app v${v.app}; agent v${v.agent}; tgbot v${v.tgbot}`;
}

/** Читает версии напрямую с диска (без кэша), для сравнения до/после изменений. */
export function getVersionsFresh(root?: string): { app: string; agent: string; tgbot: string } {
  const base = root ?? process.cwd();
  const path = join(base, "version.json");
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      const data = JSON.parse(raw) as { app?: string; agent?: string; tgbot?: string };
      return {
        app: data.app ?? "1.0.0",
        agent: data.agent ?? "1.0.0",
        tgbot: data.tgbot ?? "1.0.0",
      };
    } catch {
      // fallthrough
    }
  }
  return { app: "1.0.0", agent: "1.0.0", tgbot: "1.0.0" };
}
