/**
 * GET: версии приложения, агента и телеграм-бота (X.Y.Z).
 */
import { NextResponse } from "next/server";
import { getAppVersion, getAgentVersion, getTgbotVersion } from "komiss/lib/versions";
import * as http from "node:http";

const AGENT_PORT = process.env.AGENT_PORT ?? "3140";

async function fetchAgentVersion(): Promise<string | null> {
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
            resolve(data.version ?? null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

export async function GET() {
  const agentVersion = await fetchAgentVersion();
  return NextResponse.json({
    app: getAppVersion(),
    agent: agentVersion ?? getAgentVersion(),
    tgbot: getTgbotVersion(),
  });
}
