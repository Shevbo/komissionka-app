/**
 * GET: контекст для клавиатуры бота — версии, проект, модели, режим.
 * Auth: Bearer TELEGRAM_BOT_TOKEN.
 */
import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";
import { getAppVersion, getAgentVersion, getTgbotVersion } from "komiss/lib/versions";
import { getModeLabel, getModeButtonLabel } from "komiss/lib/agent-mode-labels";
import { ALL_AGENT_MODELS, getModelById } from "komiss/lib/agent-models";
import * as http from "node:http";

const TELEGRAM_AUTH_HEADERS = {
  Authorization: `Bearer ${process.env.TELEGRAM_BOT_TOKEN}`,
};
const AGENT_PORT = process.env.AGENT_PORT ?? "3140";

async function fetchAgentVersion(): Promise<string> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: Number(AGENT_PORT),
        path: "/health",
        method: "GET",
        timeout: 3000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as { version?: string };
            resolve(data.version ?? getAgentVersion());
          } catch {
            resolve(getAgentVersion());
          }
        });
      }
    );
    req.on("error", () => resolve(getAgentVersion()));
    req.on("timeout", () => {
      req.destroy();
      resolve(getAgentVersion());
    });
    req.end();
  });
}

export async function GET(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("X-Telegram-Bot-Token");
  if (!token || token !== process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.site_settings.findUnique({ where: { id: "main" } });
  const mode = (settings?.agent_mode?.trim() ?? "consult") as string;
  const validMode = mode === "chat" || mode === "consult" || mode === "dev" ? mode : "consult";
  const selectedModel = settings?.agent_llm_model?.trim() ?? null;
  const modelName = selectedModel ? getModelById(selectedModel)?.name ?? selectedModel : "из .env";
  const project = process.env.AGENT_PROJECT ?? "Комиссионка";
  const projectsRaw = process.env.AGENT_PROJECTS ?? project;
  const projects = projectsRaw.split(",").map((p) => p.trim()).filter(Boolean);
  const projectsList = projects.length > 0 ? projects : [project];

  const [appV, agentV, tgbotV] = [getAppVersion(), await fetchAgentVersion(), getTgbotVersion()];
  const projectLabel = `${project} [app v${appV}; agent v${agentV}; tgbot v${tgbotV}]`;

  return NextResponse.json({
    versions: { app: appV, agent: agentV, tgbot: tgbotV },
    project,
    projects: projectsList,
    projectLabel,
    model: selectedModel,
    modelName,
    models: ALL_AGENT_MODELS,
    mode: validMode,
    modeLabel: getModeLabel(validMode),
    modeButtonLabel: getModeButtonLabel(validMode),
  });
}
