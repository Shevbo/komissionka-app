import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { testCaseId: string } },
) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const testCaseId = params.testCaseId;
  const runs = await prisma.test_runs.findMany({
    where: { test_case_id: testCaseId },
    orderBy: { started_at: "desc" },
  });

  return NextResponse.json({
    data: runs.map((r) => ({
      id: r.id,
      testCaseId: r.test_case_id,
      runNumber: r.run_number,
      startedAt: r.started_at.toISOString(),
      finishedAt: r.finished_at?.toISOString() ?? null,
      status: r.status,
      runner: r.runner,
      requestContext: r.request_context,
      agentLogId: r.agent_log_id,
      statusDumpPath: r.status_dump_path,
      steps: r.steps,
      comparisonResult: r.comparison_result,
    })),
  });
}

