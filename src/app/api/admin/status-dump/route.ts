import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function POST() {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      })
    : null;

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { stdout, stderr } = await execAsync("bash scripts/status-dump.sh", {
      cwd: process.cwd(),
      maxBuffer: 4 * 1024 * 1024,
    });

    const match = stdout.match(/OK:\s+(.+status-\d{8}-\d{6}\.dump)/);
    const path = match ? match[1].trim() : null;

    return NextResponse.json({
      ok: true,
      path,
      stdout: stdout.trim(),
      stderr: stderr.trim() || null,
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const message = err.message ?? String(e);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        stdout: (err.stdout ?? "").toString(),
        stderr: (err.stderr ?? "").toString(),
      },
      { status: 500 },
    );
  }
}

