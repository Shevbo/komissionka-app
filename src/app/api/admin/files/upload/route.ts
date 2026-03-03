/**
 * Загрузить файл в папку. POST multipart/form-data: file, path (директория назначения)
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { mkdir, writeFile } from "fs/promises";
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

export async function POST(request: Request) {
  const admin = await isAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const pathParam = (formData.get("path") as string) || "";
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const dir = resolvePath(pathParam);
  try {
    await mkdir(dir, { recursive: true });
    const dest = join(dir, file.name);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buf);
    return NextResponse.json({ ok: true, path: pathParam ? `${pathParam}/${file.name}` : file.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
