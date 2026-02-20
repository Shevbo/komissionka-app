import { getSupabaseClient } from "komiss/lib/supabase";
import Link from "next/link";
import { Card } from "komiss/components/ui/card";
import { ItemChat } from "komiss/components/item-chat";

type Params = { id: string };

export default async function ItemPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = getSupabaseClient();

  if (!supabase) {
    return (
      <div className="min-h-screen bg-background p-8">
        <p className="text-destructive">Ошибка конфигурации</p>
        <Link href="/">← На главную</Link>
      </div>
    );
  }

  const { data: item, error } = await supabase
    .from("items")
    .select("id, title, description, price, location, image_url, status, is_auction, sale_price")
    .eq("id", id)
    .single();

  if (error || !item) {
    return (
      <div className="min-h-screen bg-background p-8">
        <p className="text-destructive">
          {error?.message ?? "Товар не найден"}
        </p>
        <Link href="/" className="text-primary hover:underline">
          ← На главную
        </Link>
      </div>
    );
  }

  const formatPrice = (price: number | null) =>
    price != null ? `${Number(price).toLocaleString("ru-RU")} ₽` : "—";

  const salePrice = (item as { sale_price?: number | null }).sale_price;
  const isAuction = (item as { is_auction?: boolean | null }).is_auction;

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center text-muted-foreground hover:text-foreground"
        >
          ← Назад к каталогу
        </Link>

        <Card className="overflow-hidden">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="aspect-square w-full bg-muted md:aspect-auto md:min-h-[400px]">
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
            </div>
            <div className="flex flex-col p-6 md:p-8">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-medium text-white">
                  Активно
                </span>
                {isAuction && (
                  <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">
                    АУКЦИОН
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold md:text-3xl">{item.title}</h1>

              <div className="mt-6 space-y-4">
                <div className="flex items-baseline gap-3">
                  {salePrice != null ? (
                    <>
                      <span className="text-lg text-muted-foreground line-through">
                        {formatPrice(item.price)}
                      </span>
                      <span className="text-2xl font-bold text-orange-600">
                        {formatPrice(salePrice)}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-primary">
                      {formatPrice(item.price)}
                    </span>
                  )}
                </div>

                {item.location && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Местоположение:</span>{" "}
                    {item.location}
                  </p>
                )}

                {item.description && (
                  <div>
                    <h3 className="mb-2 font-semibold">Описание</h3>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <section className="mt-10">
          <ItemChat itemId={id} />
        </section>
      </main>
    </div>
  );
}
