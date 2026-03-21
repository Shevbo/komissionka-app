import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { isTestRunStaleRunning, staleRunMergedFinalizeData } from "komiss/lib/test-run-config";
import { buildTestRunExportPayload } from "komiss/lib/test-run-export";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

function getAppOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXTAUTH_URL?.trim() || process.env.APP_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return "http://127.0.0.1:3000";
}

const testCaseSelect = {
  id: true,
  number: true,
  title: true,
  module_id: true,
  description: true,
  kind: true,
  scope: true,
  prompt_template: true,
  parameters: true,
  expected_result: true,
  tags: true,
  enabled: true,
  ui_pages: true,
  api_endpoints: true,
  code_refs: true,
  db_entities: true,
  spec_enriched_by_ai: true,
  spec_enriched_at: true,
  spec_enriched_model: true,
  created_at: true,
  updated_at: true,
} as const;

/**
 * Полный JSON прогона + кейс для скачивания / передачи в ИИ (без секретов .env).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { runId } = await context.params;
  let run = await prisma.test_runs.findUnique({
    where: { id: runId },
    include: { test_case: { select: testCaseSelect } },
  });

  if (!run || !run.test_case) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isTestRunStaleRunning(run.status, run.started_at)) {
    await prisma.test_runs.update({
      where: { id: run.id },
      data: staleRunMergedFinalizeData(run.diagnostics) as object,
    });
    const refreshed = await prisma.test_runs.findUnique({
      where: { id: runId },
      include: { test_case: { select: testCaseSelect } },
    });
    if (!refreshed?.test_case) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    run = refreshed;
  }

  const payload = buildTestRunExportPayload(run, getAppOrigin(request));
  const body = JSON.stringify(payload, null, 2);
  const filename = `test-run-${payload.run.runNumber}-${payload.run.id}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
