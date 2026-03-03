/**
 * Проверка статуса служб (app, agent, bot) для подвала отчёта.
 */
import { execSync } from "node:child_process";

export interface ServicesStatus {
  app: boolean;
  agent: boolean;
  bot: boolean;
}

/** Возвращает статус служб или undefined при ошибке. */
export function getServicesStatus(root: string): ServicesStatus | undefined {
  try {
    const out = execSync(`npx tsx scripts/check-services-status.ts`, {
      cwd: root,
      encoding: "utf-8",
    });
    return JSON.parse(out.trim()) as ServicesStatus;
  } catch {
    return undefined;
  }
}
