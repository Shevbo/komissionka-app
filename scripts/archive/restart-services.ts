#!/usr/bin/env npx tsx
/**
 * [АРХИВ] Локальный перезапуск сервисов — НЕ ИСПОЛЬЗУЕТСЯ.
 * Репозиторий на сервере, перезапуск: pm2 restart komissionka agent bot
 *
 * Было: npx tsx scripts/restart-services.ts <app|agent|bot|all>
 * Использование: npx tsx scripts/restart-services.ts <app|agent|bot|all>
 *
 * Таймауты: ожидание остановки — 15 с (SIGTERM), затем принудительно (SIGKILL).
 * Запуск в фоне (detached) чтобы не блокировать вызывающий процесс.
 */
import { spawn, execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(process.cwd());
const SHUTDOWN_WAIT_MS = 15_000;
const DELAY_BEFORE_RESTART_MS = 2000;

const PORTS: Record<string, number> = {
  app: 3000,
  agent: parseInt(process.env.AGENT_PORT ?? "3140", 10),
};

function getPidsOnPort(port: number): number[] {
  const pids: number[] = [];
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      for (const line of out.split("\n")) {
        const m = line.trim().split(/\s+/);
        const pid = parseInt(m[m.length - 1] ?? "", 10);
        if (Number.isFinite(pid) && pid > 0) pids.push(pid);
      }
    } else {
      const out = execSync(`lsof -ti :${port}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      if (out) pids.push(...out.split(/\s+/).map((s) => parseInt(s, 10)).filter(Number.isFinite));
    }
  } catch {
    /* порт свободен */
  }
  return [...new Set(pids)];
}

function killPids(pids: number[], force = false): void {
  for (const pid of pids) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill ${force ? "/F" : ""} /PID ${pid}`, { stdio: "ignore" });
      } else {
        process.kill(pid, force ? "SIGKILL" : "SIGTERM");
      }
    } catch {
      /* уже завершён */
    }
  }
}

function stopByPort(port: number): boolean {
  const pids = getPidsOnPort(port);
  if (pids.length === 0) return true;
  killPids(pids, false);
  const deadline = Date.now() + SHUTDOWN_WAIT_MS;
  while (Date.now() < deadline) {
    if (getPidsOnPort(port).length === 0) return true;
    try {
      execSync("ping 127.0.0.1 -n 1 >nul 2>&1", { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
  killPids(getPidsOnPort(port), true);
  return getPidsOnPort(port).length === 0;
}

function stopBot(): boolean {
  try {
    if (process.platform === "win32") {
      const out = execSync('wmic process where "name=\'node.exe\'" get processid,commandline 2>nul', {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids: number[] = [];
      for (const line of out.split("\n")) {
        if (/telegram-bot[\\/]bot\.ts/i.test(line) || /telegram-bot.*bot\.ts/i.test(line)) {
          const m = line.match(/\d+/g);
          if (m) pids.push(parseInt(m[m.length - 1]!, 10));
        }
      }
      if (pids.length > 0) {
        killPids(pids, false);
        const deadline = Date.now() + SHUTDOWN_WAIT_MS;
        while (Date.now() < deadline) {
          try {
            const check = execSync('wmic process where "name=\'node.exe\'" get commandline 2>nul', {
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
            });
            if (!/telegram-bot.*bot\.ts/i.test(check)) break;
          } catch {
            break;
          }
          try {
            execSync(process.platform === "win32" ? "ping 127.0.0.1 -n 2 >nul 2>&1" : "sleep 1", { stdio: "ignore" });
          } catch {
            /* ignore */
          }
        }
        killPids(pids, true);
      }
      return true;
    }
    execSync("pkill -f 'telegram-bot.*bot.ts'", { stdio: "ignore" });
    return true;
  } catch {
    return true;
  }
}

function startApp(): void {
  spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    shell: true,
    env: { ...process.env },
  }).unref();
}

function startAgent(): void {
  spawn("npm", ["run", "agent:serve"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    shell: true,
    env: { ...process.env },
  }).unref();
}

function startBot(): void {
  spawn("npm", ["run", "bot:start"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    shell: true,
    env: { ...process.env },
  }).unref();
}

function restart(target: string): void {
  if (target === "app") {
    stopByPort(PORTS.app);
    startApp();
    console.log("[restart] app (port 3000) — перезапущен");
  } else if (target === "agent") {
    stopByPort(PORTS.agent);
    startAgent();
    console.log(`[restart] agent (port ${PORTS.agent}) — перезапущен`);
  } else if (target === "bot") {
    stopBot();
    startBot();
    console.log("[restart] bot — перезапущен");
  } else if (target === "all") {
    stopByPort(PORTS.app);
    stopByPort(PORTS.agent);
    stopBot();
    startApp();
    startAgent();
    startBot();
    console.log("[restart] app, agent, bot — перезапущены");
  }
}

function runDelayed(target: string): void {
  const delaySec = Math.ceil(DELAY_BEFORE_RESTART_MS / 1000);
  const waitCmd = process.platform === "win32"
    ? `ping 127.0.0.1 -n ${delaySec + 1} >nul 2>&1`
    : `sleep ${delaySec}`;
  const cmd = `${waitCmd} && npx tsx "${join(ROOT, "scripts", "archive", "restart-services.ts")}" ${target} --no-delay`;
  const child = spawn(cmd, [], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
}

function main(): void {
  const args = process.argv.slice(2);
  const target = (args[0] ?? "").toLowerCase();
  const noDelay = args.includes("--no-delay");

  if (!["app", "agent", "bot", "all"].includes(target)) {
    console.error("Использование: npx tsx scripts/archive/restart-services.ts <app|agent|bot|all>");
    process.exit(1);
  }

  if (!noDelay && (target === "agent" || target === "all")) {
    runDelayed(target);
    console.log(`[restart] Перезапуск ${target} запланирован через ${DELAY_BEFORE_RESTART_MS / 1000} с`);
    return;
  }

  restart(target);
}

main();
