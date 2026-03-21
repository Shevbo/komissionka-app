import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { isTestRunStaleRunning, staleRunMergedFinalizeData } from "komiss/lib/test-run-config";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { runId } = await context.params;
  let run = await prisma.test_runs.findUnique({
    where: { id: runId },
    include: {
      test_case: {
        select: {
          id: true,
          number: true,
          title: true,
          module_id: true,
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isTestRunStaleRunning(run.status, run.started_at)) {
    await prisma.test_runs.update({
      where: { id: run.id },
      data: staleRunMergedFinalizeData(run.diagnostics) as object,
    });
    const refreshed = await prisma.test_runs.findUnique({
      where: { id: runId },
      include: {
        test_case: {
          select: {
            id: true,
            number: true,
            title: true,
            module_id: true,
          },
        },
      },
    });
    if (!refreshed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    run = refreshed;
  }

  return NextResponse.json({
    data: {
      id: run.id,
      testCaseId: run.test_case_id,
      runNumber: run.run_number,
      startedAt: run.started_at.toISOString(),
      finishedAt: run.finished_at?.toISOString() ?? null,
      status: run.status,
      runner: run.runner,
      requestContext: run.request_context,
      agentLogId: run.agent_log_id,
      statusDumpPath: run.status_dump_path,
      conversationLog: run.conversation_log,
      steps: run.steps,
      comparisonResult: run.comparison_result,
      diagnostics: run.diagnostics,
      testCase: run.test_case,
    },
  });
}

