"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "komiss/lib/supabase-browser";
import { ItemCardAnimated } from "komiss/components/item-card-animated";

type Item = {
  id: string;
  title: string | null;
  price: number | null;
  location: string | null;
  image_url: string | null;
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

  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const channel = supabase
      .channel("catalog-sync")
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "items" },
        (payload) => {
          console.log("Каталог получил сигнал об удалении:", payload);
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) {
            setItems((prev) => prev.filter((item) => item.id !== deletedId));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "items" },
        (payload) => {
          console.log("Каталог получил сигнал о добавлении:", payload);
          const newItem = payload.new as Item;
          if (newItem.status === "active") {
            setItems((prev) => [newItem, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) => i.title?.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

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
