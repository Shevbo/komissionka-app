import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { generateItemImageFile } from "komiss/lib/item-image-generator";

export const runtime = "nodejs";

async function isAuthorized(request: Request, itemId: string): Promise<{
  authorized: boolean;
  status?: number;
  error?: string;
}> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return { authorized: false, status: 401, error: "Unauthorized" };
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (profile?.role === "admin") {
    return { authorized: true };
  }

  const item = await prisma.items.findUnique({
    where: { id: itemId },
    select: { seller_id: true },
  });

  if (!item || item.seller_id !== userId) {
    return { authorized: false, status: 403, error: "Forbidden" };
  }

  return { authorized: true };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idClean = typeof id === "string" ? id.trim() : "";
  if (!idClean) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { authorized, status, error } = await isAuthorized(request, idClean);
  if (!authorized) {
    return NextResponse.json({ error }, { status });
  }

  if (!process.env.AGENT_LLM_API_KEY) {
    return NextResponse.json(
      { error: "AGENT_LLM_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const item = await prisma.items.findUnique({
    where: { id: idClean },
    select: {
      title: true,
      description: true,
      image_url: true,
      image_urls: true,
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { url: newUrl } = await generateItemImageFile({
      itemId: idClean,
      title: item.title ?? "Товар",
      description: item.description,
    });

    const existingUrls =
      item.image_urls && item.image_urls.length > 0
        ? item.image_urls
        : item.image_url
          ? [item.image_url]
          : [];

    const image_urls = [...existingUrls, newUrl];

    await prisma.items.update({
      where: { id: idClean },
      data: {
        image_url: image_urls[0] ?? null,
        image_urls,
      },
    });

    revalidatePath("/");
    revalidatePath(`/items/${idClean}`);

    return NextResponse.json({
      ok: true,
      added_url: newUrl,
      image_urls,
    });
  } catch (e: unknown) {
    console.error("Failed to generate item image via Gemini:", e);
    const err = e as Error & { error?: { message?: string }; status?: number };
    const msg = err?.message ?? "";
    const apiMessage: string | undefined =
      typeof err?.error?.message === "string" ? err.error.message : msg;

    if (apiMessage?.includes("This API is not available in your current location")) {
      return NextResponse.json(
        {
          error:
            "Сервис генерации изображений Gemini недоступен с текущего региона. Задайте в .env прокси: AGENT_PROXY (или AGENT_HTTPS_PROXY) и перезапустите приложение.",
        },
        { status: 503 }
      );
    }
    if (msg.includes("AGENT_PROXY") && msg.includes("задайте прокси")) {
      return NextResponse.json(
        { error: "Задайте в .env прокси для Gemini: AGENT_PROXY или AGENT_HTTPS_PROXY или AGENT_HTTP_PROXY, затем перезапустите приложение." },
        { status: 503 }
      );
    }
    if ((err?.status === 404 || msg.includes("is not found")) && msg.includes("generateContent")) {
      return NextResponse.json(
        { error: "Модель для генерации изображений недоступна. Задайте в .env ITEM_IMAGE_MODEL=gemini-2.5-flash-image (или другую поддерживаемую модель) и перезапустите приложение." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Не удалось сгенерировать иллюстрацию для товара" },
      { status: 500 }
    );
  }
}

