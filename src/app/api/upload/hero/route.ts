import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const HERO_MAX_WIDTH_PX = 1920;

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
  const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "hero");
  await mkdir(dir, { recursive: true });
  const filepath = path.join(dir, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  const isImage = (file.type || "").startsWith("image/");

  if (isImage) {
    try {
      const meta = await sharp(buf).metadata();
      const w = meta.width ?? 0;
      if (w > HERO_MAX_WIDTH_PX) {
        const outBuf = await sharp(buf)
          .resize(HERO_MAX_WIDTH_PX, undefined, { withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        const jpgFilename = filename.replace(/\.[a-z0-9]+$/i, ".jpg");
        const jpgPath = path.join(dir, jpgFilename);
        await writeFile(jpgPath, outBuf);
        return NextResponse.json({ url: `/uploads/hero/${jpgFilename}` });
      }
    } catch {
      // fallback: write original
    }
  }

  await writeFile(filepath, buf);
  return NextResponse.json({ url: `/uploads/hero/${filename}` });
}
