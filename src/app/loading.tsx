import { Skeleton } from "komiss/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero skeleton */}
        <section className="relative overflow-hidden rounded-2xl bg-zinc-100 px-8 py-16 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <Skeleton className="mx-auto h-12 w-[min(100%,400px)] rounded-lg" />
            <Skeleton className="mx-auto h-6 w-[min(100%,320px)] rounded-lg" />
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Skeleton className="h-12 w-40 rounded-lg" />
              <Skeleton className="h-12 w-full max-w-[280px] rounded-lg sm:w-72" />
            </div>
          </div>
        </section>

        {/* News skeleton */}
        <section className="mt-16">
          <Skeleton className="mb-6 h-8 w-32" />
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6">
                <Skeleton className="h-6 w-3/4" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <Skeleton className="mt-4 h-3 w-24" />
              </div>
            ))}
          </div>
        </section>

        {/* Catalog skeleton */}
        <section className="mt-16">
          <Skeleton className="mb-8 h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-xl border border-zinc-200 p-4">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="mt-3 h-5 w-4/5" />
                <Skeleton className="mt-2 h-4 w-1/3" />
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials skeleton */}
        <section className="mt-16">
          <Skeleton className="mb-6 h-8 w-28" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <Skeleton className="mt-4 h-4 w-24" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
