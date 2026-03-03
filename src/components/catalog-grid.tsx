"use client";

import { useEffect, useState } from "react";
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

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {displayItems.map((item, index) => (
        <ItemCardAnimated key={item.id} item={item} index={index} />
      ))}
    </div>
  );
}
