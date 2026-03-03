import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const UPLOADS_AGENT_DIR =
  process.env.UPLOADS_AGENT_DIR ||
  path.join(process.cwd(), "public", "uploads", "agent");

const EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (!filename || /[^a-zA-Z0-9._-]/.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  const filePath = path.join(UPLOADS_AGENT_DIR, filename);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const buf = readFileSync(filePath);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
    const contentType = EXT_TYPES[ext] ?? "image/png";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }
}
