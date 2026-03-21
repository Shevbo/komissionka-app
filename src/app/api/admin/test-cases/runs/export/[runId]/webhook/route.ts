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

const WEBHOOK_TIMEOUT_MS = 25_000;

/**
 * POST: отправить тот же JSON, что и GET export, на URL из TEST_RUN_EXPORT_WEBHOOK_URL
 * (Zapier, Make, n8n, свой приёмник, бот в Telegram и т.д.).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const webhookUrl = process.env.TEST_RUN_EXPORT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json(
      {
        error: "Не задан TEST_RUN_EXPORT_WEBHOOK_URL в .env",
        hint: "Задайте URL вебхука на сервере и перезапустите приложение.",
      },
      { status: 501 },
    );
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
  const body = JSON.stringify(payload);

  const bearer = process.env.TEST_RUN_EXPORT_WEBHOOK_BEARER?.trim();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    clearTimeout(t);
    return NextResponse.json({
      ok: res.ok,
      webhookStatus: res.status,
      webhookSnippet: text.slice(0, 500),
    });
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 502 },
    );
  }
}
