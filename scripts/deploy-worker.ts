/**
 * Deploy Worker — обработчик очереди деплоя
 * Запускается как PM2 процесс, опрашивает очередь каждые 5 секунд
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new pg.Pool({ connectionString, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const POLL_INTERVAL_MS = 5000;
const SCRIPTS_DIR = process.env.SCRIPTS_DIR ?? `${process.env.HOME}/komissionka/scripts`;

interface QueueItem {
  id: string;
  environment_id: string;
  operation: string;
  source_env_id: string | null;
  branch: string | null;
  status: string;
  environment: {
    name: string;
    port_app: number;
    db_name: string;
    directory: string;
    branch: string;
  };
}

async function log(queueId: string | null, envId: string | null, operation: string, status: string, output?: string, error?: string, durationMs?: number) {
  await prisma.deploy_log.create({
    data: {
      queue_id: queueId,
      environment_id: envId,
      operation,
      status,
      output: output?.slice(0, 50000),
      error: error?.slice(0, 10000),
      duration_ms: durationMs,
    },
  });
}

async function executeScript(scriptName: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cmd = `bash ${SCRIPTS_DIR}/${scriptName} ${args.map((a) => `"${a}"`).join(" ")}`;
  console.log(`[WORKER] Executing: ${cmd}`);

  const { stdout, stderr } = await execAsync(cmd, {
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return { stdout, stderr };
}

async function processCreate(item: QueueItem): Promise<void> {
  const { name, port_app, db_name } = item.environment;
  const branch = item.branch ?? item.environment.branch;

  const { stdout, stderr } = await executeScript("env-create.sh", [name, String(port_app), branch, db_name]);

  await prisma.deploy_environments.update({
    where: { id: item.environment_id },
    data: { status: "active", branch },
  });

  console.log(`[WORKER] Create completed for ${name}`);
  if (stderr) console.warn(`[WORKER] Stderr: ${stderr}`);
}

async function processDeploy(item: QueueItem): Promise<void> {
  const { name } = item.environment;
  const branch = item.branch ?? "";

  const { stdout, stderr } = await executeScript("env-deploy.sh", [name, branch]);

  if (item.branch) {
    await prisma.deploy_environments.update({
      where: { id: item.environment_id },
      data: { branch: item.branch },
    });
  }

  console.log(`[WORKER] Deploy completed for ${name}`);
  if (stderr) console.warn(`[WORKER] Stderr: ${stderr}`);
}

async function processCopy(item: QueueItem): Promise<void> {
  if (!item.source_env_id) {
    throw new Error("source_env_id is required for copy operation");
  }

  const sourceEnv = await prisma.deploy_environments.findUnique({
    where: { id: item.source_env_id },
    select: { name: true },
  });

  if (!sourceEnv) {
    throw new Error(`Source environment ${item.source_env_id} not found`);
  }

  const { name } = item.environment;
  const { stdout, stderr } = await executeScript("env-copy.sh", [sourceEnv.name, name, "true"]);

  await prisma.deploy_environments.update({
    where: { id: item.environment_id },
    data: { status: "active" },
  });

  console.log(`[WORKER] Copy completed: ${sourceEnv.name} -> ${name}`);
  if (stderr) console.warn(`[WORKER] Stderr: ${stderr}`);
}

async function processDelete(item: QueueItem): Promise<void> {
  const { name } = item.environment;

  const { stdout, stderr } = await executeScript("env-delete.sh", [name]);

  await prisma.deploy_environments.delete({
    where: { id: item.environment_id },
  });

  console.log(`[WORKER] Delete completed for ${name}`);
  if (stderr) console.warn(`[WORKER] Stderr: ${stderr}`);
}

async function processQueueItem(item: QueueItem): Promise<void> {
  const startTime = Date.now();

  try {
    await prisma.deploy_queue.update({
      where: { id: item.id },
      data: { status: "running", started_at: new Date() },
    });

    await log(item.id, item.environment_id, item.operation, "running", `Starting ${item.operation}...`);

    switch (item.operation) {
      case "create":
        await processCreate(item);
        break;
      case "deploy":
        await processDeploy(item);
        break;
      case "copy":
        await processCopy(item);
        break;
      case "delete":
        await processDelete(item);
        break;
      default:
        throw new Error(`Unknown operation: ${item.operation}`);
    }

    const duration = Date.now() - startTime;

    await prisma.deploy_queue.update({
      where: { id: item.id },
      data: { status: "completed", completed_at: new Date() },
    });

    await log(item.id, item.environment_id, item.operation, "completed", `${item.operation} completed successfully`, undefined, duration);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[WORKER] Error processing ${item.operation} for ${item.environment.name}:`, errorMessage);

    await prisma.deploy_queue.update({
      where: { id: item.id },
      data: { status: "failed", completed_at: new Date() },
    });

    if (item.operation !== "delete") {
      await prisma.deploy_environments.update({
        where: { id: item.environment_id },
        data: { status: "stopped" },
      }).catch(() => {});
    }

    await log(item.id, item.environment_id, item.operation, "failed", undefined, errorMessage, duration);
  }
}

async function pollQueue(): Promise<void> {
  try {
    const item = await prisma.deploy_queue.findFirst({
      where: { status: "pending" },
      orderBy: { created_at: "asc" },
      include: {
        environment: {
          select: {
            name: true,
            port_app: true,
            db_name: true,
            directory: true,
            branch: true,
          },
        },
      },
    });

    if (item) {
      console.log(`[WORKER] Processing: ${item.operation} for ${item.environment.name}`);
      await processQueueItem(item as QueueItem);
    }
  } catch (error) {
    console.error("[WORKER] Poll error:", error);
  }
}

async function main(): Promise<void> {
  console.log("[WORKER] Deploy worker started");
  console.log(`[WORKER] Scripts directory: ${SCRIPTS_DIR}`);
  console.log(`[WORKER] Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Сначала проверим, есть ли prod среда, если нет — создадим
  const prodEnv = await prisma.deploy_environments.findUnique({ where: { name: "prod" } });
  if (!prodEnv) {
    console.log("[WORKER] Creating prod environment record...");
    await prisma.deploy_environments.create({
      data: {
        name: "prod",
        port_app: 3000,
        port_agent: 3100,
        port_bot: 3200,
        directory: "~/komissionka",
        db_name: "komissionka_db",
        branch: "main",
        status: "active",
        is_prod: true,
      },
    });
  }

  while (true) {
    await pollQueue();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error("[WORKER] Fatal error:", error);
  process.exit(1);
});
