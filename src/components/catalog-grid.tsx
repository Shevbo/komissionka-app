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
};

// Минимальное количество колонок на небольших экранах (телефоны).
// Допустимые значения: 1–4.
const MIN_MOBILE_COLUMNS = 2;

// Максимальная ширина карточки товара (px) — чтобы на очень широких мониторах
// карточки не растягивались на всю ширину.
const MAX_CARD_WIDTH_PX = 360;

export function CatalogGrid({
  initialItems,
  loadError,
  searchQuery,
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
    const cols = Math.min(Math.max(MIN_MOBILE_COLUMNS, 1), 4);
    // Минимальная ширина колонки: не больше MAX_CARD_WIDTH_PX и не больше 1/cols ширины контейнера.
    return `repeat(auto-fit, minmax(min(${MAX_CARD_WIDTH_PX}px, ${100 / cols}%), 1fr))`;
  }, []);

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
