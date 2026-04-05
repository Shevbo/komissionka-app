import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { mkdir } from "fs/promises";
import path from "path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import sharp from "sharp";
import {
  HERO_DERIVATIVE_WIDTHS,
  HERO_DEFAULT_DERIVATIVE_WIDTH,
} from "komiss/lib/hero-image";

/** Align with next.config experimental.proxyClientMaxBodySize. */
const MAX_BYTES = 40 * 1024 * 1024;

const SHARP_INPUT_OPTS = {
  sequentialRead: true,
  limitInputPixels: 268_402_689,
} as const;

export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || !file.size) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Файл слишком большой (макс. ${MAX_BYTES / (1024 * 1024)} МБ)` },
      { status: 413 }
    );
  }

  const rawExt = (file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const ext = rawExt || "jpg";
  const base = `${Date.now()}-${crypto.randomUUID()}`;
  const origFilename = `${base}__orig.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "hero");
  await mkdir(dir, { recursive: true });
  const origPath = path.join(dir, origFilename);

  try {
    await pipeline(
      Readable.fromWeb(file.stream() as unknown as NodeReadableStream),
      createWriteStream(origPath)
    );
  } catch {
    return NextResponse.json({ error: "Не удалось сохранить файл" }, { status: 500 });
  }

  const isImage = (file.type || "").startsWith("image/");
  if (!isImage) {
    return NextResponse.json({ url: `/uploads/hero/${origFilename}` });
  }

  try {
    for (const w of HERO_DERIVATIVE_WIDTHS) {
      const out = path.join(dir, `${base}__w${w}.webp`);
      await sharp(origPath, SHARP_INPUT_OPTS)
        .rotate()
        .resize(w, undefined, { withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(out);
    }
  } catch {
    return NextResponse.json({ url: `/uploads/hero/${origFilename}` });
  }

  return NextResponse.json({
    url: `/uploads/hero/${base}__w${HERO_DEFAULT_DERIVATIVE_WIDTH}.webp`,
  });
}
