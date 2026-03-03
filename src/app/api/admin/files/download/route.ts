/**
 * Скачать файл. GET ?path=...
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { readFile, stat } from "fs/promises";
import { resolve } from "path";

const BASE = process.cwd();

function resolvePath(relative: string): string {
  const p = resolve(BASE, relative.replace(/\.\./g, ""));
  if (!p.startsWith(BASE)) return BASE;
  return p;
}

async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function GET(request: Request) {
  const admin = await isAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const pathParam = searchParams.get("path") || "";
  if (!pathParam) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const target = resolvePath(pathParam);
  try {
    const s = await stat(target);
    if (s.isDirectory()) {
      return NextResponse.json({ error: "Cannot download directory" }, { status: 400 });
    }
    const buf = await readFile(target);
    const name = pathParam.split("/").pop() || "file";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
