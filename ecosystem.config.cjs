/**
 * PM2 config для VPS с ограниченной RAM.
 * Ограничения памяти предотвращают OOM killer.
 */
module.exports = {
  apps: [
    {
      name: "komissionka",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "700M",
      env: { NODE_OPTIONS: "--max-old-space-size=512", TZ: "Europe/Moscow" },
    },
    {
      name: "agent",
      script: "npx",
      args: "tsx agent/serve.ts",
      cwd: __dirname,
      max_memory_restart: "400M",
      env: { NODE_OPTIONS: "--max-old-space-size=384", TZ: "Europe/Moscow" },
    },
    {
      name: "bot",
      script: "npx",
      args: "tsx telegram-bot/bot.ts",
      cwd: __dirname,
      max_memory_restart: "200M",
      exp_backoff_restart_delay: 1000,
      max_restarts: 30,
      env: { NODE_OPTIONS: "--max-old-space-size=192 --no-deprecation", TZ: "Europe/Moscow" },
    },
    {
      name: "deploy-worker",
      script: "npx",
      args: "tsx scripts/deploy-worker.ts",
      cwd: __dirname,
      max_memory_restart: "150M",
      env: {
        NODE_OPTIONS: "--max-old-space-size=128",
        TZ: "Europe/Moscow",
        SCRIPTS_DIR: `${__dirname}/scripts`,
      },
    },
  ],
};
