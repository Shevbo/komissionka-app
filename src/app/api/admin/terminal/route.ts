/**
 * Выполнение команды в shell на сервере. Только admin.
 * POST body: { command: string }
 * Ответ: поток текста (text/plain).
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { spawn } from "child_process";

async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function POST(request: Request) {
  const admin = await isAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let command: string;
  try {
    const body = await request.json();
    command = typeof body?.command === "string" ? body.command.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!command) {
    return NextResponse.json({ error: "command required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const shell = process.platform === "win32" ? "cmd" : "sh";
      const flag = process.platform === "win32" ? "/c" : "-c";
      const child = spawn(shell, [flag, command], {
        cwd: process.cwd(),
        env: process.env,
      });
      const write = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      child.stdout.on("data", (d) => write(d.toString()));
      child.stderr.on("data", (d) => write(d.toString()));
      child.on("close", (code) => {
        if (code !== 0) write(`\n[exit ${code}]\n`);
        controller.close();
      });
      child.on("error", (err) => {
        write(`\nError: ${err.message}\n`);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
