import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { mkdir } from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 5;
const ALLOWED = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "txt"];

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];

  if (!files?.length) {
    return NextResponse.json({ error: "Файлы не загружены" }, { status: 400 });
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Максимум ${MAX_FILES} файлов за раз` },
      { status: 400 }
    );
  }

  const urls: string[] = [];
  const dir = path.join(process.cwd(), "public", "uploads", "chat");
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    if (!file.size) continue;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Файл "${file.name}" превышает ${MAX_FILE_SIZE / 1024 / 1024} МБ` },
        { status: 400 }
      );
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    if (!ALLOWED.includes(ext)) {
      return NextResponse.json(
        { error: `Тип файла "${file.name}" не поддерживается` },
        { status: 400 }
      );
    }
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const filepath = path.join(dir, filename);
    const nodeStream = Readable.fromWeb(file.stream() as import("stream/web").ReadableStream);
    await pipeline(nodeStream, createWriteStream(filepath));
    urls.push(`/uploads/chat/${filename}`);
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: "Нет валидных файлов" }, { status: 400 });
  }

  return NextResponse.json({ urls });
}
