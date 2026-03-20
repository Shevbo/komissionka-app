import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { abortTestRunController } from "komiss/lib/test-run-control";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { runId } = await context.params;
  const run = await prisma.test_runs.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.status !== "running" && run.status !== "pending") {
    return NextResponse.json({ error: "Run is not active", data: { status: run.status } }, { status: 400 });
  }

  const now = new Date();
  const diagnostics = {
    ...(run.diagnostics && typeof run.diagnostics === "object" ? (run.diagnostics as Record<string, unknown>) : {}),
    cancelledByAdmin: true,
    cancelledAt: now.toISOString(),
  };

  const updated = await prisma.test_runs.update({
    where: { id: runId },
    data: {
      status: "cancelled",
      finished_at: now,
      diagnostics: diagnostics as unknown as object,
    },
  });

  abortTestRunController(runId);

  return NextResponse.json({
    data: {
      id: updated.id,
      status: updated.status,
      finishedAt: updated.finished_at?.toISOString() ?? null,
    },
  });
}

