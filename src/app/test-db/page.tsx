import { getSupabaseClient } from "komiss/lib/supabase";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";

export default async function TestDbPage() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-4 text-2xl font-semibold text-destructive">
            Ошибка конфигурации
          </h1>
          <p className="text-muted-foreground">
            Отсутствуют переменные окружения. Проверьте .env.local
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-primary underline hover:no-underline"
          >
            ← На главную
          </Link>
        </div>
      </div>
    );
  }

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, price, location, image_url");

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-4 text-2xl font-semibold text-destructive">
            Ошибка загрузки
          </h1>
          <p className="text-muted-foreground">{error.message}</p>
          <Link
            href="/"
            className="mt-4 inline-block text-primary underline hover:no-underline"
          >
            ← На главную
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-semibold">Тест базы данных</h1>
        {items.length === 0 ? (
          <p className="text-lg text-muted-foreground">Склад пуст</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="aspect-square w-full bg-muted">
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
                <CardHeader>
                  <h3 className="line-clamp-2 text-lg font-semibold">
                    {item.title}
                  </h3>
                </CardHeader>
                <CardContent className="space-y-1 pt-0">
                  <p className="text-xl font-bold text-primary">
                    {item.price != null
                      ? `${Number(item.price).toLocaleString("ru-RU")} ₽`
                      : "—"}
                  </p>
                  {item.location && (
                    <p className="text-sm text-muted-foreground">
                      {item.location}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Link
          href="/"
          className="mt-8 inline-block text-primary underline hover:no-underline"
        >
          ← На главную
        </Link>
      </div>
    </div>
  );
}
