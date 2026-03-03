#!/usr/bin/env npx tsx
/**
 * Проверка статуса сервисов.
 * Вывод: JSON {"app": boolean, "agent": boolean, "bot": boolean}
 * app: HTTP GET к /api/health (надёжнее, чем lsof)
 * agent: порт AGENT_PORT
 * bot: процесс telegram-bot
 */
import { execSync } from "node:child_process";

// Локальная проверка (agent и app на одном сервере)
const APP_HEALTH_URL = "http://127.0.0.1:3000/api/health";
const AGENT_PORT = parseInt(process.env.AGENT_PORT ?? "3140", 10);

function isAppRunning(): boolean {
  if (process.platform !== "win32") {
    try {
      execSync(`curl -sf --connect-timeout 3 --max-time 5 "${APP_HEALTH_URL}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
  }
  return isPortInUse(3000); // Windows: fallback на проверку порта
}

function isPortInUse(port: number): boolean {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return out.trim().length > 0;
    }
    execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

function isBotRunning(): boolean {
  try {
    if (process.platform === "win32") {
      const out = execSync('wmic process where "name=\'node.exe\'" get commandline 2>nul', {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return /telegram-bot[\\/]bot\.ts|telegram-bot.*bot\.ts/i.test(out);
    }
    const out = execSync("pgrep -f 'telegram-bot.*bot.ts' 2>/dev/null || true", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function main(): void {
  const status = {
    app: isAppRunning(),
    agent: isPortInUse(AGENT_PORT),
    bot: isBotRunning(),
  };
  console.log(JSON.stringify(status));
}

main();
