import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { mkdir } from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

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
  const nodeStream = Readable.fromWeb(file.stream() as import("stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(filepath));
  const url = `/uploads/hero/${filename}`;
  return NextResponse.json({ url });
}
