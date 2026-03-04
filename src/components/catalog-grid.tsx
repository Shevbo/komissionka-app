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
  gapPx?: number | null;
  cardPaddingPx?: number | null;
  titleFontPx?: number | null;
  textFontPx?: number | null;
};

const DEFAULT_MIN_MOBILE_COLUMNS = 2;
const DEFAULT_MAX_CARD_WIDTH_PX = 360;
const DEFAULT_GAP_PX = 24;
const DEFAULT_CARD_PADDING_PX = 24;
const DEFAULT_TITLE_FONT_PX = 18;
const DEFAULT_TEXT_FONT_PX = 14;

export function CatalogGrid({
  initialItems,
  loadError,
  searchQuery,
  minColumns,
  maxCardWidth,
  gapPx,
  cardPaddingPx,
  titleFontPx,
  textFontPx,
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

  const effectiveGapPx = Math.max(8, Math.min((gapPx ?? DEFAULT_GAP_PX) || DEFAULT_GAP_PX, 64));

  const gridTemplateColumns = useMemo(() => {
    const effectiveMinColumns = Math.min(
      Math.max((minColumns ?? DEFAULT_MIN_MOBILE_COLUMNS) || DEFAULT_MIN_MOBILE_COLUMNS, 1),
      4
    );
    const effectiveMaxCardWidth = Math.max(
      200,
      Math.min((maxCardWidth ?? DEFAULT_MAX_CARD_WIDTH_PX) || DEFAULT_MAX_CARD_WIDTH_PX, 600)
    );
    if (effectiveMinColumns === 1) {
      return "1fr";
    }
    const gapTotal = (effectiveMinColumns - 1) * effectiveGapPx;
    return `repeat(${effectiveMinColumns}, minmax(min(${effectiveMaxCardWidth}px, calc((100% - ${gapTotal}px) / ${effectiveMinColumns})), 1fr))`;
  }, [minColumns, maxCardWidth, effectiveGapPx]);

  const effectiveCardPaddingPx = Math.max(8, Math.min((cardPaddingPx ?? DEFAULT_CARD_PADDING_PX) || DEFAULT_CARD_PADDING_PX, 48));
  const effectiveTitleFontPx = Math.max(12, Math.min((titleFontPx ?? DEFAULT_TITLE_FONT_PX) || DEFAULT_TITLE_FONT_PX, 28));
  const effectiveTextFontPx = Math.max(10, Math.min((textFontPx ?? DEFAULT_TEXT_FONT_PX) || DEFAULT_TEXT_FONT_PX, 24));

  return (
    <div
      className="grid justify-center"
      style={{ gridTemplateColumns, gap: effectiveGapPx }}
    >
      {displayItems.map((item, index) => (
        <ItemCardAnimated
          key={item.id}
          item={item}
          index={index}
          cardPaddingPx={effectiveCardPaddingPx}
          titleFontPx={effectiveTitleFontPx}
          textFontPx={effectiveTextFontPx}
        />
      ))}
    </div>
  );
}
