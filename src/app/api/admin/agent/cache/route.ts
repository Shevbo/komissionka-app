import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { queryAgentCache, getAgentCacheSize, toCsvExport } from "komiss/lib/agent-cache-api";

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project") ?? undefined;
  const topic = searchParams.get("topic") ?? undefined;
  const topicPattern = searchParams.get("topicPattern") ?? undefined;
  const promptPattern = searchParams.get("promptPattern") ?? undefined;
  const responsePattern = searchParams.get("responsePattern") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const exportCsv = searchParams.get("export") === "1";

  const filter = {
    project,
    topic: topic || undefined,
    topicPattern: topicPattern || undefined,
    promptPattern: promptPattern || undefined,
    responsePattern: responsePattern || undefined,
  };

  if (exportCsv) {
    const rows = await queryAgentCache(filter, { limit: 500, offset: 0 });
    const csv = toCsvExport(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agent-cache-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const rows = await queryAgentCache(filter, { limit, offset });
  const sizeBytes = await getAgentCacheSize();

  return NextResponse.json({
    rows,
    sizeBytes,
    sizeMb: (sizeBytes / (1024 * 1024)).toFixed(2),
  });
}
