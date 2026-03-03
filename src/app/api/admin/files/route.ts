/**
 * Файловый менеджер: list, delete. Только admin.
 * GET ?path=... — список файлов и папок
 * DELETE — body { path: string } — удалить файл или папку
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { readdir, stat, rm } from "fs/promises";
import { join, resolve } from "path";

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
  const dir = resolvePath(pathParam);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (e) => {
        const fullPath = join(dir, e.name);
        const s = await stat(fullPath);
        const relPath = pathParam ? `${pathParam}/${e.name}` : e.name;
        return {
          name: e.name,
          path: relPath,
          isDir: e.isDirectory(),
          size: s.size,
          mtime: s.mtime.toISOString(),
        };
      })
    );
    return NextResponse.json({ items, base: pathParam || "." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await isAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let pathParam: string;
  try {
    const body = await request.json();
    pathParam = typeof body?.path === "string" ? body.path : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!pathParam) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const target = resolvePath(pathParam);
  if (target === BASE) {
    return NextResponse.json({ error: "Cannot delete root" }, { status: 400 });
  }
  try {
    await rm(target, { recursive: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
