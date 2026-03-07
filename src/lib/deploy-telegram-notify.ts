/**
 * Отправка уведомления администраторам в Telegram о результате деплоя.
 * Вызывается из /api/deploy/log/append после записи в журнал.
 */

import { prisma } from "komiss/lib/prisma";
import { getVersionsFresh } from "komiss/lib/versions";

const TELEGRAM_API = "https://api.telegram.org";

export type DeployNotifyPayload = {
  environment_name: string;
  operation: string;
  status: string;
  output?: string | null;
  error?: string | null;
  duration_ms?: number | null;
  requested_by?: string | null;
};

function buildMessage(payload: DeployNotifyPayload, versions: { app: string; agent: string; tgbot: string }): string {
  const { environment_name, operation, status, output, error, duration_ms, requested_by } = payload;
  const icon = status === "completed" ? "✅" : "❌";
  const lines: string[] = [
    `${icon} Деплой ${environment_name}`,
    ``,
    `Статус: ${status}`,
    `Операция: ${operation}`,
    `Версии: app ${versions.app}, agent ${versions.agent}, tgbot ${versions.tgbot}`,
    `Кто запустил: ${requested_by ?? "—"}`,
  ];
  if (duration_ms != null) {
    lines.push(`Длительность: ${(duration_ms / 1000).toFixed(1)} с`);
  }
  if (output) {
    const short = output.replace(/\n/g, " ").slice(0, 200);
    lines.push(`Коммит/вывод: ${short}${output.length > 200 ? "…" : ""}`);
  }
  if (error) {
    lines.push(`Ошибка: ${error.slice(0, 300)}${error.length > 300 ? "…" : ""}`);
  }
  return lines.join("\n");
}

export async function notifyDeployToTelegram(payload: DeployNotifyPayload): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;

  const versions = getVersionsFresh();
  const text = buildMessage(payload, versions);

  const admins = await prisma.profiles.findMany({
    where: { role: "admin", telegram_id: { not: null } },
    select: { telegram_id: true },
  });

  const chatIds = admins.map((p) => p.telegram_id).filter((id): id is string => !!id);
  if (chatIds.length === 0) return;

  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  await Promise.allSettled(
    chatIds.map((telegramId) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramId,
          text,
          disable_web_page_preview: true,
        }),
      })
    )
  );
}
