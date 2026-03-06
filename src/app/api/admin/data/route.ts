import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

async function isAdminRequest(request: Request): Promise<boolean> {
  const agentKey = request.headers.get("x-agent-api-key");
  if (agentKey && process.env.AGENT_API_KEY && agentKey === process.env.AGENT_API_KEY) {
    return true;
  }
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function GET(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ADMIN_ITEMS_LIMIT = 500;
  const ADMIN_ACTIVITY_LIMIT = 300;
  const ADMIN_PROFILES_LIMIT = 500;
  const ADMIN_CART_LIMIT = 500;
  const ADMIN_NEWS_LIMIT = 100;
  const ADMIN_TESTIMONIALS_LIMIT = 100;
  const ADMIN_BACKLOG_LIMIT = 500;

  const [
    itemsCount,
    messagesCount,
    items,
    messages,
    profiles,
    cartRows,
    activityRows,
    siteSettings,
    news,
    testimonials,
    backlogRows,
  ] = await Promise.all([
    prisma.items.count(),
    prisma.messages.count(),
    prisma.items.findMany({
      orderBy: { created_at: "desc" },
      take: ADMIN_ITEMS_LIMIT,
      select: { id: true, title: true, price: true, status: true, created_at: true, image_url: true, image_urls: true },
    }),
    prisma.messages.findMany({
      orderBy: { created_at: "desc" },
      take: 10,
      select: { id: true, item_id: true, author_name: true, content: true, created_at: true },
    }),
    prisma.profiles.findMany({
      orderBy: { full_name: "asc" },
      take: ADMIN_PROFILES_LIMIT,
      select: { id: true, full_name: true, email: true, role: true, last_active_at: true, telegram_id: true, telegram_username: true },
    }),
    prisma.cart_items.findMany({
      orderBy: { created_at: "asc" },
      take: ADMIN_CART_LIMIT,
      select: { user_id: true, items: { select: { title: true } } },
    }),
    prisma.user_activity.findMany({
      orderBy: { created_at: "desc" },
      take: ADMIN_ACTIVITY_LIMIT,
      select: { user_id: true, action_type: true, created_at: true, details: true },
    }),
    prisma.site_settings.findUnique({ where: { id: "main" } }),
    prisma.news.findMany({
      orderBy: { created_at: "desc" },
      take: ADMIN_NEWS_LIMIT,
      select: { id: true, title: true, body: true, created_at: true },
    }),
    prisma.testimonials.findMany({
      orderBy: { created_at: "desc" },
      take: ADMIN_TESTIMONIALS_LIMIT,
      select: { id: true, author_name: true, text: true, is_active: true, created_at: true, rating: true },
    }),
    prisma.backlog.findMany({
      orderBy: [{ order_num: "asc" }, { created_at: "desc" }],
      take: ADMIN_BACKLOG_LIMIT,
    }),
  ]);

  const cartItemsByUser: Record<string, string[]> = {};
  for (const row of cartRows) {
    const title = row.items?.title ?? "Без названия";
    if (!cartItemsByUser[row.user_id ?? ""]) cartItemsByUser[row.user_id ?? ""] = [];
    cartItemsByUser[row.user_id ?? ""].push(title);
  }

  const activityByUser: Record<string, { action_type: string; created_at: string; details: unknown }[]> = {};
  const activityCountByUser: Record<string, number> = {};
  for (const r of activityRows) {
    const key = r.user_id ?? (typeof r.details === "object" && r.details && "session_id" in r.details ? `anon:${(r.details as { session_id?: string }).session_id}` : null);
    if (!key) continue;
    activityCountByUser[key] = (activityCountByUser[key] ?? 0) + 1;
    if (!activityByUser[key]) activityByUser[key] = [];
    activityByUser[key].push({
      action_type: r.action_type ?? "",
      created_at: r.created_at?.toISOString() ?? "",
      details: r.details,
    });
  }

  return NextResponse.json({
  itemsCount,
  messagesCount,
  items: items.map((i: any) => ({
      ...i,
      price: i.price == null ? null : Number(i.price),
      created_at: i.created_at?.toISOString() ?? null,
      // Объединяем image_url (если есть) и image_urls
      image_urls: i.image_urls && i.image_urls.length > 0
        ? i.image_urls
        : (i.image_url ? [i.image_url] : []), 
    })),
    messages: messages.map((m) => ({
      ...m,
      created_at: m.created_at?.toISOString() ?? null,
    })),
    profiles: profiles.map((p) => ({
      ...p,
      last_active_at: p.last_active_at?.toISOString() ?? null,
    })),
    cartItemsByUser,
    activityCountByUser,
    activityByUser,
    allActivityRows: activityRows.map((r) => ({
      user_id: r.user_id,
      action_type: r.action_type,
      created_at: r.created_at?.toISOString() ?? null,
      details: r.details,
    })),
    siteSettings: siteSettings
      ? {
          key: siteSettings.key,
          hero_title: siteSettings.hero_title,
          hero_subtitle: siteSettings.hero_subtitle,
          hero_image_url: siteSettings.hero_image_url,
          h_banner: siteSettings.h_banner,
          news_banner_height: siteSettings.news_banner_height,
          news_scroll_speed: siteSettings.news_scroll_speed,
          catalog_min_columns: siteSettings.catalog_min_columns,
          catalog_max_card_width: siteSettings.catalog_max_card_width,
          catalog_gap_px: siteSettings.catalog_gap_px,
          catalog_card_padding_px: siteSettings.catalog_card_padding_px,
          catalog_title_font_px: siteSettings.catalog_title_font_px,
          catalog_text_font_px: siteSettings.catalog_text_font_px,
          agent_llm_model: siteSettings.agent_llm_model,
          agent_mode: siteSettings.agent_mode,
        }
      : null,
    news: news.map((n) => ({
      ...n,
      created_at: n.created_at?.toISOString() ?? null,
    })),
    testimonials: testimonials.map((t) => ({
      ...t,
      created_at: t.created_at?.toISOString() ?? null,
      rating: t.rating,
    })),
    backlog: backlogRows.map((b) => ({
      id: b.id,
      order_num: b.order_num,
      sprint_number: b.sprint_number,
      sprint_status: b.sprint_status,
      short_description: b.short_description,
      description_prompt: b.description_prompt,
      task_status: b.task_status,
      doc_link: b.doc_link,
      test_order_or_link: b.test_order_or_link,
      created_at: b.created_at?.toISOString() ?? null,
      status_changed_at: b.status_changed_at?.toISOString() ?? null,
    })),
  });
}
