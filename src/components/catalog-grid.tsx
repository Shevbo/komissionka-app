"use client";

import { useEffect, useState, useMemo } from "react";
import { ItemCardAnimated } from "komiss/components/item-card-animated";

type Item = {
  id: string;
  title: string | null;
  price: number | null;
  location: string | null;
  image_urls: string[] | null; // Изменено на image_urls
  status: string | null;
  is_auction?: boolean | null;
  sale_price?: number | null;
};

type Props = {
  initialItems: Item[];
  loadError: string | null;
  searchQuery: string;
  minColumns?: number | null;
  maxCardWidth?: number | null;
};

// Значения по умолчанию для сетки каталога (если не заданы через настройки сайта/админку).
const DEFAULT_MIN_MOBILE_COLUMNS = 2;
const DEFAULT_MAX_CARD_WIDTH_PX = 360;

export function CatalogGrid({
  initialItems,
  loadError,
  searchQuery,
  minColumns,
  maxCardWidth,
}: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const displayItems = items.filter((i) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return i.title?.toLowerCase().includes(q);
  });

  if (loadError) {
    return <p className="text-destructive">{loadError}</p>;
  }

  if (displayItems.length === 0) {
    return (
      <p className="text-lg text-muted-foreground">
        {searchQuery ? "Ничего не найдено" : "Пока нет товаров"}
      </p>
    );
  }

  const gridTemplateColumns = useMemo(() => {
    const effectiveMinColumns = Math.min(
      Math.max((minColumns ?? DEFAULT_MIN_MOBILE_COLUMNS) || DEFAULT_MIN_MOBILE_COLUMNS, 1),
      4
    );
    const effectiveMaxCardWidth = Math.max(
      200,
      Math.min((maxCardWidth ?? DEFAULT_MAX_CARD_WIDTH_PX) || DEFAULT_MAX_CARD_WIDTH_PX, 600)
    );
    const gapPx = 24; // gap-6
    if (effectiveMinColumns === 1) {
      return "1fr";
    }
    // Учитываем gap: (100% - (N-1)*gap) / N — макс. ширина колонки, чтобы гарантированно влезло N колонок.
    const gapTotal = (effectiveMinColumns - 1) * gapPx;
    return `repeat(${effectiveMinColumns}, minmax(min(${effectiveMaxCardWidth}px, calc((100% - ${gapTotal}px) / ${effectiveMinColumns})), 1fr))`;
  }, [minColumns, maxCardWidth]);

  return (
    <div
      className="grid gap-6 justify-center"
      style={{ gridTemplateColumns }}
    >
      {displayItems.map((item, index) => (
        <ItemCardAnimated key={item.id} item={item} index={index} />
      ))}
    </div>
  );
}
