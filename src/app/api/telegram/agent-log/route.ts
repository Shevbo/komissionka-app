/**
 * GET: последний ход рассуждений агента (для кнопки в Telegram-боте).
 * Auth: Bearer TELEGRAM_BOT_TOKEN.
 */
import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AGENT_LOGS_DIR = ".agent-logs";
const LAST_REASONING_FILE = "last-reasoning.txt";
const MAX_SEND_SIZE = 45 * 1024 * 1024; // Telegram document limit ~50MB, leave margin

export async function GET(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("X-Telegram-Bot-Token");
  if (!token || token !== process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const root = process.cwd();
  const filePath = join(root, AGENT_LOGS_DIR, LAST_REASONING_FILE);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Log not found", empty: true }, { status: 404 });
  }

  try {
    let content = readFileSync(filePath, "utf-8");
    if (content.length > MAX_SEND_SIZE) {
      content = `[лог обрезан, показаны последние ${MAX_SEND_SIZE} символов]\n${content.slice(-MAX_SEND_SIZE)}`;
    }
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="last-reasoning.txt"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read log" }, { status: 500 });
  }
}
