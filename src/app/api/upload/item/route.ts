import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const ITEM_FHD_MAX_WIDTH = 1920;
const ITEM_FHD_MAX_HEIGHT = 1080;

export async function POST(request: Request) {
  if (process.env.S3_BUCKET) {
    return NextResponse.json(
      {
        error:
          "S3_BUCKET задан — требуется реализация загрузки в облако. Текущий код использует локальную ФС (public/uploads).",
      },
      { status: 501 }
    );
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const formData = await request.formData();
  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const urls: string[] = [];
  const dir = path.join(process.cwd(), "public", "uploads", "items");
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    if (!file.size) continue;
    const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(dir, filename);
    const buf = Buffer.from(await file.arrayBuffer());
    const isImage = (file.type || "").startsWith("image/");

    if (isImage) {
      try {
        const meta = await sharp(buf).metadata();
        const w = meta.width ?? 0;
        const h = meta.height ?? 0;
        const needsResize = w > ITEM_FHD_MAX_WIDTH || h > ITEM_FHD_MAX_HEIGHT;
        if (needsResize) {
          const out = await sharp(buf)
            .resize(ITEM_FHD_MAX_WIDTH, ITEM_FHD_MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 88 })
            .toBuffer();
          const outPath = path.join(dir, filename.replace(/\.[a-z0-9]+$/i, ".jpg"));
          await writeFile(outPath, out);
          urls.push(`/uploads/items/${filename.replace(/\.[a-z0-9]+$/i, ".jpg")}`);
          continue;
        }
      } catch {
        // fallback: write original
      }
    }

    await writeFile(filepath, buf);
    urls.push(`/uploads/items/${filename}`);
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: "No valid files uploaded" }, { status: 400 });
  }

  return NextResponse.json({ urls });
}
