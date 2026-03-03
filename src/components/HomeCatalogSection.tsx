"use client";

import { useState } from "react";
import { CatalogGrid } from "komiss/components/catalog-grid";
import { Input } from "komiss/components/ui/input";

export type HomeCatalogItem = {
  id: string;
  title: string | null;
  price: number | null;
  sale_price?: number | null;
  location: string | null;
  image_urls: string[] | null; // Изменено на image_urls
  status: string | null;
  is_auction?: boolean | null;
  author_name?: string | null;
};

type Props = {
  items: HomeCatalogItem[];
};

export function HomeCatalogSection({ items }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <section className="mt-16" aria-label="Каталог товаров">
      <h2 className="mb-4 text-2xl font-semibold text-foreground">Каталог товаров</h2>
      <div className="mb-6">
        <Input
          type="search"
          placeholder="Поиск по названию..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
          aria-label="Поиск по каталогу"
        />
      </div>
      <CatalogGrid
        initialItems={items}
        loadError={null}
        searchQuery={searchQuery}
      />
    </section>
  );
}
