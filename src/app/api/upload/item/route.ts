import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { mkdir } from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

// TODO: Вынести загрузку в S3-совместимое хранилище для Production-окружения (Vercel/Docker без volume).
// Текущий код использует process.cwd()/public/uploads — на Serverless (Vercel, AWS Lambda) и ReadOnly ФС он упадёт.
// При заданной переменной S3_BUCKET следует переключиться на облачное хранилище (S3, MinIO, R2 и т.п.).

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
  const files = formData.getAll("files") as File[]; // Изменено на getAll

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
    const nodeStream = Readable.fromWeb(file.stream() as import("stream/web").ReadableStream);
    await pipeline(nodeStream, createWriteStream(filepath));
    urls.push(`/uploads/items/${filename}`);
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: "No valid files uploaded" }, { status: 400 });
  }

  return NextResponse.json({ urls }); // Возвращаем массив URL-адресов
}
