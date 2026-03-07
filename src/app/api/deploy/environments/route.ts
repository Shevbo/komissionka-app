import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import * as http from "node:http";

async function fetchVersionFromPort(port: number): Promise<{ app?: string; agent?: string; tgbot?: string } | null> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/version",
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
              app?: string;
              agent?: string;
              tgbot?: string;
            };
            resolve(data);
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

async function isAdminRequest(request: Request): Promise<boolean> {
  const agentKey = request.headers.get("x-agent-api-key");
  if (agentKey && process.env.AGENT_API_KEY && agentKey === process.env.AGENT_API_KEY) {
    return true;
  }
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function GET(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const environments = await prisma.deploy_environments.findMany({
    orderBy: [{ is_prod: "desc" }, { name: "asc" }],
    include: {
      queue_items: {
        where: { status: { in: ["pending", "running"] } },
        orderBy: { created_at: "desc" },
        take: 1,
      },
    },
  });

  const withVersions = await Promise.all(
    environments.map(async (env) => {
      const version = await fetchVersionFromPort(env.port_app);
      const resolvedStatus = version ? "active" : env.status;
      return {
        id: env.id,
        name: env.name,
        port_app: env.port_app,
        port_agent: env.port_agent,
        port_bot: env.port_bot,
        directory: env.directory,
        db_name: env.db_name,
        branch: env.branch,
        status: resolvedStatus,
        is_prod: env.is_prod,
        created_at: env.created_at.toISOString(),
        updated_at: env.updated_at.toISOString(),
        active_operation: env.queue_items[0]?.operation ?? null,
        version: version ? { app: version.app, agent: version.agent, tgbot: version.tgbot } : null,
      };
    })
  );

  return NextResponse.json({ data: withVersions });
}

export async function POST(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const name = typeof b?.name === "string" ? b.name.trim().toLowerCase() : "";
  if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) {
    return NextResponse.json({ error: "Name must start with letter, contain only a-z, 0-9, _, -" }, { status: 400 });
  }
  if (name === "prod") {
    return NextResponse.json({ error: "Cannot create env named 'prod' manually" }, { status: 400 });
  }

  const existing = await prisma.deploy_environments.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: `Environment '${name}' already exists` }, { status: 400 });
  }

  const port_app = typeof b?.port_app === "number" ? b.port_app : parseInt(String(b?.port_app), 10);
  if (isNaN(port_app) || port_app < 3001 || port_app > 65535) {
    return NextResponse.json({ error: "port_app must be a valid port number >= 3001" }, { status: 400 });
  }

  const branch = typeof b?.branch === "string" ? b.branch.trim() : "main";

  const port_agent = port_app + 100;
  const port_bot = port_app + 200;
  const directory = `~/komissionka-${name}`;
  const db_name = `komissionka_${name}`;

  try {
    const env = await prisma.deploy_environments.create({
      data: {
        name,
        port_app,
        port_agent,
        port_bot,
        directory,
        db_name,
        branch,
        status: "creating",
        is_prod: false,
      },
    });

    await prisma.deploy_queue.create({
      data: {
        environment_id: env.id,
        operation: "create",
        branch,
        status: "pending",
        requested_by: "admin",
      },
    });

    return NextResponse.json({ ok: true, id: env.id, name: env.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create environment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
