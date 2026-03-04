"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { Button } from "komiss/components/ui/button";
import { useCart } from "komiss/store/useCart";
import { useActivity } from "komiss/components/ActivityProvider";
import { cn } from "komiss/lib/utils";
import { PLACEHOLDER_DATA_URI } from "komiss/lib/placeholder";

/** Плейсхолдер-URL — не делать сетевой запрос, использовать встроенный data URI. */
function isPlaceholderUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const s = url.trim().toLowerCase();
  return (
    s.includes("placeholder") ||
    s.includes("/images/placeholder") ||
    s.startsWith("/api/placeholder")
  );
}

type Item = {
  id: string;
  title: string | null;
  price: number | null;
  location: string | null;
  image_urls: string[] | null; // Изменено на image_urls
  status: string | null;
  is_auction?: boolean | null;
  sale_price?: number | null;
  author_name?: string | null;
};

type Props = {
  item: Item;
  index: number;
  cardPaddingPx?: number;
  titleFontPx?: number;
  textFontPx?: number;
};

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
  }).format(price);
}

export function ItemCardAnimated({ item, index, cardPaddingPx, titleFontPx, textFontPx }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { items, addItem } = useCart();
  const { trackAction } = useActivity();
  const inCart = items.some((i) => i.id === item.id);

  // Новое состояние для индекса текущего изображения
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  // Fallback при ошибке загрузки (битая ссылка)
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { rootMargin: "0px 0px -40px 0px", threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Сброс imageError при смене картинки
  useEffect(() => {
    setImageError(false);
  }, [currentImageIndex, item.image_urls]);

  // Эффект для автоматической смены изображений
  useEffect(() => {
    if (item.image_urls && item.image_urls.length > 1) {
      const interval = setInterval(() => {
        setCurrentImageIndex((prevIndex) =>
          (prevIndex + 1) % item.image_urls!.length
        );
      }, 5000); // Смена каждые 5 секунд (5000 мс)
      return () => clearInterval(interval);
    }
  }, [item.image_urls]);

  // Вычисляем текущий URL изображения; для плейсхолдеров используем data URI без сетевого запроса
  const rawUrl = item.image_urls?.[currentImageIndex] || null;
  const currentImageUrl =
    rawUrl && !isPlaceholderUrl(rawUrl) ? rawUrl : null;
  const displaySrc =
    currentImageUrl && !imageError ? currentImageUrl : PLACEHOLDER_DATA_URI;

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-500 ease-out",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-6 opacity-0"
      )}
      style={
        visible
          ? {
              transitionDelay: `${index * 50}ms`,
            }
          : undefined
      }
    >
      <Link href={`/items/${item.id}`} className="group block h-full">
        <Card className="h-full overflow-hidden transition-all duration-300 hover:shadow-lg group-hover:-translate-y-1">
          <div className="relative aspect-square w-full bg-muted">
            <img
              src={displaySrc}
              alt={item.title ?? "Фото товара"}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
            <div className="absolute right-2 top-2 flex flex-wrap gap-1">
              <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                Активно
              </span>
              {item.is_auction && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  АУКЦИОН
                </span>
              )}
            </div>
          </div>
          <CardHeader
            className="pb-1"
            style={cardPaddingPx != null ? { padding: cardPaddingPx, paddingBottom: cardPaddingPx * 0.25 } : undefined}
          >
            <h3
              className="line-clamp-2 font-semibold"
              style={titleFontPx != null ? { fontSize: `${titleFontPx}px` } : undefined}
            >
              {item.title}
            </h3>
          </CardHeader>
          <CardContent
            className="space-y-1 pt-0"
            style={cardPaddingPx != null ? { padding: cardPaddingPx, paddingTop: 0 } : undefined}
          >
            {item.author_name && (
              <p
                className="text-muted-foreground"
                style={textFontPx != null ? { fontSize: `${textFontPx}px` } : undefined}
              >
                Продавец: {item.author_name}
              </p>
            )}
            <div className="flex items-baseline gap-2">
              {item.sale_price != null ? (
                <>
                  <span
                    className="text-muted-foreground line-through"
                    style={textFontPx != null ? { fontSize: `${textFontPx}px` } : undefined}
                  >
                    {formatPrice(item.price)}
                  </span>
                  <span
                    className="font-bold text-orange-600"
                    style={textFontPx != null ? { fontSize: `${textFontPx}px` } : undefined}
                  >
                    {formatPrice(item.sale_price)}
                  </span>
                </>
              ) : (
                <span
                  className="font-bold text-primary"
                  style={textFontPx != null ? { fontSize: `${textFontPx}px` } : undefined}
                >
                  {formatPrice(item.price)}
                </span>
              )}
            </div>
            {item.location && (
              <p
                className="text-muted-foreground"
                style={textFontPx != null ? { fontSize: `${textFontPx}px` } : undefined}
              >
                {item.location}
              </p>
            )}
            <Button
              size="sm"
              variant={inCart ? "secondary" : "default"}
              disabled={inCart}
              className="mt-2 w-full gap-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!inCart) {
                  addItem({
                    id: item.id,
                    title: item.title,
                    price: item.sale_price ?? item.price,
                    image_urls: currentImageUrl ? [currentImageUrl] : [PLACEHOLDER_DATA_URI],
                    location: item.location,
                  });
                  trackAction("add_to_cart", item.id);
                }
              }}
            >
              <ShoppingCart className="h-4 w-4" />
              {inCart ? "В корзине" : "В корзину"}
            </Button>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
