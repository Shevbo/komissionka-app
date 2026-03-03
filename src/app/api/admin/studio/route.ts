import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import postgres from "postgres";
import { createPostgresJSExecutor } from "@prisma/studio-core/data/postgresjs";
import { serializeError } from "@prisma/studio-core/data/bff";

export const dynamic = "force-dynamic";

let _sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (!_sql) _sql = postgres(url, { max: 2 });
  return _sql;
}

async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return false;
  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  return profile?.role === "admin";
}

export async function POST(request: Request) {
  const admin = await isAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      procedure?: string;
      query?: { sql: string; parameters?: readonly unknown[]; transformations?: unknown };
      sequence?: readonly [{ sql: string; parameters?: readonly unknown[] }, { sql: string; parameters?: readonly unknown[] }];
    };

    const sql = getSql();
    const executor = createPostgresJSExecutor(sql);

    if (body.procedure === "sequence" && body.sequence?.length === 2) {
      const [r1, r2] = await Promise.all([
        executor.execute(body.sequence[0] as never),
        executor.execute(body.sequence[1] as never),
      ]);
      const [e1, res1] = r1;
      if (e1) return NextResponse.json([[serializeError(e1)]]);
      const [e2, res2] = r2;
      if (e2) return NextResponse.json([[null, res1], [serializeError(e2)]]);
      return NextResponse.json([[null, res1], [null, res2]]);
    }
    const query = body.query;
    if (!query || !("sql" in query) || !query.sql) {
      return NextResponse.json(
        [serializeError(new Error("Query is required"))],
        { status: 400 }
      );
    }
    const [error, results] = await executor.execute(query as never);
    if (error) {
      return NextResponse.json([serializeError(error)]);
    }
    return NextResponse.json([null, results]);
  } catch (err) {
    return NextResponse.json(
      [serializeError(err instanceof Error ? err : new Error(String(err)))],
      { status: 400 }
    );
  }
}
