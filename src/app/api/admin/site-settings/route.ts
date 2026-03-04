import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const {
    hero_title,
    hero_subtitle,
    hero_image_url,
    h_banner,
    news_banner_height,
    news_scroll_speed,
    catalog_min_columns,
    catalog_max_card_width,
  } = body;

  const safeCatalogMinColumns =
    typeof catalog_min_columns === "number" ? Math.min(Math.max(catalog_min_columns, 1), 4) : 2;
  const safeCatalogMaxCardWidth =
    typeof catalog_max_card_width === "number"
      ? Math.max(200, Math.min(catalog_max_card_width, 600))
      : 360;
  await prisma.site_settings.upsert({
    where: { id: "main" },
    create: {
      id: "main",
      key: "main",
      hero_title: typeof hero_title === "string" ? hero_title : "Комиссионка",
      hero_subtitle: typeof hero_subtitle === "string" ? hero_subtitle : "",
      hero_image_url: typeof hero_image_url === "string" ? hero_image_url : null,
      h_banner: typeof h_banner === "number" ? h_banner : 200,
      news_banner_height: typeof news_banner_height === "number" ? news_banner_height : 200,
      news_scroll_speed: typeof news_scroll_speed === "number" ? news_scroll_speed : 3,
      catalog_min_columns: safeCatalogMinColumns,
      catalog_max_card_width: safeCatalogMaxCardWidth,
    },
    update: {
      ...(typeof hero_title === "string" && { hero_title }),
      ...(typeof hero_subtitle === "string" && { hero_subtitle }),
      ...(hero_image_url !== undefined && { hero_image_url: hero_image_url === null || hero_image_url === "" ? null : String(hero_image_url) }),
      ...(typeof h_banner === "number" && { h_banner }),
      ...(typeof news_banner_height === "number" && { news_banner_height }),
      ...(typeof news_scroll_speed === "number" && { news_scroll_speed }),
      ...(typeof catalog_min_columns === "number" && { catalog_min_columns: safeCatalogMinColumns }),
      ...(typeof catalog_max_card_width === "number" && { catalog_max_card_width: safeCatalogMaxCardWidth }),
    },
  });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
