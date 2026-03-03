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
      env: { NODE_OPTIONS: "--max-old-space-size=512" },
    },
    {
      name: "agent",
      script: "npx",
      args: "tsx agent/serve.ts",
      cwd: __dirname,
      max_memory_restart: "400M",
      env: { NODE_OPTIONS: "--max-old-space-size=384" },
    },
    {
      name: "bot",
      script: "npx",
      args: "tsx telegram-bot/bot.ts",
      cwd: __dirname,
      max_memory_restart: "200M",
      env: { NODE_OPTIONS: "--max-old-space-size=192" },
    },
  ],
};
