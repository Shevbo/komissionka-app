import { getSupabaseClient } from "komiss/lib/supabase";
import Link from "next/link";
import { Button } from "komiss/components/ui/button";
import { Input } from "komiss/components/ui/input";
import { CatalogGrid } from "komiss/components/catalog-grid";

type SearchParams = { q?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();

  const supabase = getSupabaseClient();

  let items: Array<{
    id: string;
    title: string | null;
    price: number | null;
    location: string | null;
    image_url: string | null;
    status: string | null;
    is_auction?: boolean | null;
    sale_price?: number | null;
  }> = [];
  let loadError: string | null = null;

  if (supabase) {
    let q = supabase
      .from("items")
      .select("id, title, price, location, image_url, status, is_auction, sale_price")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (query) {
      q = q.ilike("title", `%${query}%`);
    }

    const { data, error } = await q;
    if (error) loadError = error.message;
    else items = data ?? [];
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 px-8 py-16 shadow-xl sm:px-12 sm:py-20 lg:px-16 lg:py-24"
          aria-label="Главный баннер"
        >
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-6xl">
              Комиссионка: Вторая жизнь ваших вещей
            </h1>
            <p className="mt-4 text-lg text-white/95 sm:text-xl">
              Покупайте и продавайте личные вещи в Севастополе просто и
              безопасно
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button
                asChild
                size="lg"
                className="h-12 bg-white px-8 text-emerald-700 hover:bg-white/90 hover:text-emerald-800"
              >
                <Link href="/seller">Выставить вещь</Link>
              </Button>
              <form action="/" method="GET" className="w-full sm:w-auto sm:min-w-[280px]">
                <div className="flex gap-2">
                  <Input
                    type="search"
                    name="q"
                    placeholder="Поиск по названию..."
                    defaultValue={query}
                    className="h-12 border-0 bg-white/95 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-white"
                  />
                  <Button type="submit" size="lg" variant="secondary" className="h-12 px-6">
                    Найти
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* Сетка товаров */}
        <section className="mt-16" aria-label="Каталог товаров">
          <h2 className="mb-8 text-2xl font-semibold text-foreground">
            {query ? `Результаты поиска: «${query}»` : "Каталог товаров"}
          </h2>

          <CatalogGrid
            initialItems={items}
            loadError={loadError}
            searchQuery={query}
          />
        </section>
      </main>
    </div>
  );
}
