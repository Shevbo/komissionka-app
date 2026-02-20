"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { cn } from "komiss/lib/utils";

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
  item: Item;
  index: number;
};

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
  }).format(price);
}

export function ItemCardAnimated({ item, index }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

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
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.title ?? "Фото товара"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                Нет фото
              </div>
            )}
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
          <CardHeader className="pb-1">
            <h3 className="line-clamp-2 text-lg font-semibold">{item.title}</h3>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            <div className="flex items-baseline gap-2">
              {item.sale_price != null ? (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPrice(item.price)}
                  </span>
                  <span className="text-xl font-bold text-orange-600">
                    {formatPrice(item.sale_price)}
                  </span>
                </>
              ) : (
                <span className="text-xl font-bold text-primary">
                  {formatPrice(item.price)}
                </span>
              )}
            </div>
            {item.location && (
              <p className="text-sm text-muted-foreground">{item.location}</p>
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
