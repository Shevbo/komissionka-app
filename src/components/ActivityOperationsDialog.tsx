"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "komiss/components/ui/dialog";

type ActionRow = {
  action_type: string;
  created_at: string;
  details: Record<string, string> | null;
};

type ItemEnriched = {
  id: string;
  title: string | null;
  image_urls: string[] | null; // Изменено на image_urls
  price: number | null;
  author_name: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  product_click: "Просмотр",
  add_to_cart: "В корзину",
  REMOVE_FROM_CART: "Удаление из корзины",
  SEARCH: "Поиск",
  LOGIN: "Вход",
  REGISTER: "Регистрация",
  LOGOUT: "Выход",
  DISCONNECT: "Закрытие вкладки",
  settings_save: "Сохранение настроек",
  content_save: "Сохранение контента",
  news_save: "Создание новости",
  testimonial_save: "Создание отзыва",
  role_change: "Смена роли",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yy} ${hh}:${min}`;
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
  }).format(price);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: ActionRow[];
};

export function ActivityOperationsDialog({ open, onOpenChange, actions }: Props) {
  const [itemsMap, setItemsMap] = useState<Record<string, ItemEnriched>>({});
  const [loading, setLoading] = useState(false);

  const entityIds = useMemo(() => {
    if (!open || actions.length === 0) return [];
    const ids = new Set<string>();
    for (const a of actions) {
      const d = a.details as Record<string, string> | null;
      if (!d) continue;
      const id = d.entity_id ?? d.product_id;
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }, [open, actions]);

  useEffect(() => {
    if (!open || entityIds.length === 0) {
      setItemsMap({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    // POST избегает 414 URI Too Long при большом списке ID
    fetch("/api/items/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: entityIds }),
    })
      .then(async (res) => {
        const text = await res.text();
        if (!text.trim()) return { items: [] };
        try {
          return JSON.parse(text) as { items?: ItemEnriched[] };
        } catch {
          return { items: [] };
        }
      })
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, ItemEnriched> = {};
        for (const row of data.items ?? []) {
          map[row.id] = {
            id: row.id,
            title: row.title,
            image_urls: row.image_urls, // Передаем image_urls
            price: row.price,
            author_name: row.author_name ?? null,
          };
        }
        setItemsMap(map);
      })
      .catch((e) => {
        if (!cancelled) console.error("Ошибка загрузки товаров:", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, entityIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Перечень операций</DialogTitle>
        </DialogHeader>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет действий</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
            {actions.map((a, i) => {
              const d = a.details as Record<string, string> | null;
              const entityId = d?.entity_id ?? d?.product_id;
              const item = entityId ? itemsMap[entityId] : null;
              const label = ACTION_LABELS[a.action_type] ?? a.action_type;
              const query = d?.query;

              return (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border p-3 bg-card"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item?.image_urls && item.image_urls.length > 0 ? (
                      <img
                        src={item.image_urls[0]}
                        alt={item.title ?? ""}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        {entityId && loading ? "…" : "—"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {item?.title ?? (query ? `«${query}»` : label)}
                    </div>
                    {item && (
                      <div className="text-sm font-bold text-primary">
                        {formatPrice(item.price)}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {label}
                      {item?.author_name && ` · ${item.author_name}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(a.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
