import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { getTestRunStaleAfterMs, staleRunBulkFinalizeData } from "komiss/lib/test-run-config";

function mapTestCase(row: any) {
  return {
    id: row.id,
    number: row.number,
    moduleId: row.module_id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    scope: row.scope,
    promptTemplate: row.prompt_template,
    parameters: row.parameters,
    expectedResult: row.expected_result,
    tags: row.tags,
    enabled: row.enabled,
    uiPages: row.ui_pages,
    apiEndpoints: row.api_endpoints,
    codeRefs: row.code_refs,
    dbEntities: row.db_entities,
    specEnrichedByAI: row.spec_enriched_by_ai,
    specEnrichedAt: row.spec_enriched_at?.toISOString() ?? null,
    specEnrichedModel: row.spec_enriched_model,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    // агрегаты по прогонам считаем по подзапросу
    runsCount: (row as any)._count?.runs ?? 0,
    lastStatus: (row as any).last_run_status ?? null,
    lastRunAt: (row as any).last_run_at ?? null,
    successRate: (row as any).success_rate as
      | { percent: number; successCount: number; totalCount: number }
      | null
      | undefined,
  };
}

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function GET(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const staleMs = getTestRunStaleAfterMs();
  const staleCutoff = new Date(Date.now() - staleMs);
  await prisma.test_runs.updateMany({
    where: { status: "running", started_at: { lt: staleCutoff } },
    data: staleRunBulkFinalizeData() as object,
  });

  const [cases, runStats] = await Promise.all([
    prisma.test_cases.findMany({
      orderBy: [{ number: "asc" }],
      include: {
        _count: { select: { runs: true } },
        runs: {
          orderBy: { started_at: "desc" },
          take: 1,
          select: { status: true, started_at: true },
        },
      },
    }),
    prisma.test_runs.findMany({
      select: { test_case_id: true, status: true },
    }),
  ]);

  const agg = new Map<string, { total: number; success: number }>();
  for (const r of runStats) {
    const cur = agg.get(r.test_case_id) ?? { total: 0, success: 0 };
    cur.total += 1;
    if (r.status === "success") cur.success += 1;
    agg.set(r.test_case_id, cur);
  }

  const withAggregates = cases.map((c) => {
    const lastRun = c.runs[0] ?? null;
    const lastStatus = lastRun?.status ?? null;
    const lastRunAt = lastRun?.started_at?.toISOString() ?? null;
    const a = agg.get(c.id);
    const success_rate =
      a && a.total > 0
        ? {
            percent: Math.round((100 * a.success) / a.total),
            successCount: a.success,
            totalCount: a.total,
          }
        : null;
    return mapTestCase({
      ...c,
      last_run_status: lastStatus,
      last_run_at: lastRunAt,
      success_rate,
    });
  });

  return NextResponse.json({ data: withAggregates });
}

export async function POST(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const copyFromId = typeof body?.copyFromId === "string" ? body.copyFromId.trim() : "";
  if (copyFromId) {
    const source = await prisma.test_cases.findUnique({ where: { id: copyFromId } });
    if (!source) {
      return NextResponse.json({ error: "Source test case not found" }, { status: 404 });
    }
    const maxRow = await prisma.test_cases.aggregate({ _max: { number: true } });
    const nextNumber = (maxRow._max.number ?? 0) + 1;
    const baseTitle = source.title.trim();
    const suffix = " (копия)";
    const title =
      baseTitle.length + suffix.length <= 255
        ? `${baseTitle}${suffix}`
        : `${baseTitle.slice(0, 255 - suffix.length)}${suffix}`;
    const created = await prisma.test_cases.create({
      data: {
        number: nextNumber,
        module_id: source.module_id,
        title,
        description: source.description,
        kind: source.kind,
        scope: source.scope,
        prompt_template: source.prompt_template,
        parameters: source.parameters ?? undefined,
        expected_result: source.expected_result ?? undefined,
        tags: source.tags ?? [],
        enabled: source.enabled,
        ui_pages: source.ui_pages ?? [],
        api_endpoints: source.api_endpoints ?? [],
        code_refs: source.code_refs ?? [],
        db_entities: source.db_entities ?? [],
        spec_enriched_by_ai: false,
        spec_enriched_at: null,
        spec_enriched_model: null,
      },
    });
    return NextResponse.json({ data: mapTestCase({ ...created, _count: { runs: 0 } }) });
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description : "";
  const moduleId = typeof body?.moduleId === "string" ? body.moduleId.trim() : "";
  if (!title || !description || !moduleId) {
    return NextResponse.json(
      { error: "title, description and moduleId are required" },
      { status: 400 }
    );
  }

  const number = typeof body?.number === "number" ? body.number : Number(body?.number);
  if (!number || Number.isNaN(number)) {
    return NextResponse.json({ error: "number is required and must be integer" }, { status: 400 });
  }

  const created = await prisma.test_cases.create({
    data: {
      number,
      module_id: moduleId,
      title,
      description,
      kind: typeof body?.kind === "string" ? body.kind.trim() || "automatic" : "automatic",
      scope: typeof body?.scope === "string" ? body.scope.trim() || "ui" : "ui",
      prompt_template:
        typeof body?.promptTemplate === "string" ? body.promptTemplate.trim() || null : null,
      parameters: body?.parameters ?? undefined,
      expected_result: body?.expectedResult ?? undefined,
      tags: Array.isArray(body?.tags) ? body.tags.map((t: unknown) => String(t)) : [],
      enabled: body?.enabled !== false,
      ui_pages: Array.isArray(body?.uiPages) ? body.uiPages.map((p: unknown) => String(p)) : [],
      api_endpoints: Array.isArray(body?.apiEndpoints)
        ? body.apiEndpoints.map((p: unknown) => String(p))
        : [],
      code_refs: Array.isArray(body?.codeRefs) ? body.codeRefs.map((p: unknown) => String(p)) : [],
      db_entities: Array.isArray(body?.dbEntities)
        ? body.dbEntities.map((p: unknown) => String(p))
        : [],
    },
  });

  return NextResponse.json({ data: mapTestCase({ ...created, _count: { runs: 0 } }) });
}

export async function PUT(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data: any = {};
  if (body.number != null) {
    const raw = typeof body.number === "number" ? body.number : Number(body.number);
    const n = Math.floor(raw);
    if (!Number.isFinite(raw) || n <= 0 || raw !== n) {
      return NextResponse.json({ error: "number must be a positive integer" }, { status: 400 });
    }
    const conflict = await prisma.test_cases.findFirst({
      where: { number: n, NOT: { id } },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Тест-кейс с таким номером уже существует" },
        { status: 409 },
      );
    }
    data.number = n;
  }
  if (body.title != null) data.title = String(body.title);
  if (body.description != null) data.description = String(body.description);
  if (body.moduleId != null) data.module_id = String(body.moduleId);
  if (body.kind != null) data.kind = String(body.kind);
  if (body.scope != null) data.scope = String(body.scope);
  if (body.promptTemplate !== undefined)
    data.prompt_template =
      typeof body.promptTemplate === "string" ? body.promptTemplate.trim() || null : null;
  if (body.parameters !== undefined) data.parameters = body.parameters;
  if (body.expectedResult !== undefined) data.expected_result = body.expectedResult;
  if (body.tags !== undefined)
    data.tags = Array.isArray(body.tags) ? body.tags.map((t: unknown) => String(t)) : [];
  if (body.enabled !== undefined) data.enabled = !!body.enabled;
  if (body.uiPages !== undefined)
    data.ui_pages = Array.isArray(body.uiPages)
      ? body.uiPages.map((p: unknown) => String(p))
      : [];
  if (body.apiEndpoints !== undefined)
    data.api_endpoints = Array.isArray(body.apiEndpoints)
      ? body.apiEndpoints.map((p: unknown) => String(p))
      : [];
  if (body.codeRefs !== undefined)
    data.code_refs = Array.isArray(body.codeRefs)
      ? body.codeRefs.map((p: unknown) => String(p))
      : [];
  if (body.dbEntities !== undefined)
    data.db_entities = Array.isArray(body.dbEntities)
      ? body.dbEntities.map((p: unknown) => String(p))
      : [];

  const updated = await prisma.test_cases.update({
    where: { id },
    data,
  });

  return NextResponse.json({ data: mapTestCase({ ...updated, _count: { runs: 0 } }) });
}

export async function DELETE(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.test_cases.update({
    where: { id },
    data: { enabled: false },
  });

  return NextResponse.json({ ok: true });
}

