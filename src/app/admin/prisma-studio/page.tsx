"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "komiss/components/auth-provider";
import { createPostgresAdapter } from "@prisma/studio-core/data/postgres-core";
import { createStudioBFFClient } from "@prisma/studio-core/data/bff";
import "@prisma/studio-core/ui/index.css";

const Studio = dynamic(
  () => import("@prisma/studio-core/ui").then((mod) => mod.Studio),
  { ssr: false }
);

export default function AdminPrismaStudioPage() {
  const router = useRouter();
  const { userRole, loading } = useAuth();

  const adapter = useMemo(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const executor = createStudioBFFClient({
      url: `${base}/api/admin/studio`,
    });
    return createPostgresAdapter({ executor });
  }, []);

  useEffect(() => {
    if (loading) return;
    if (userRole !== "admin") {
      router.replace("/");
    }
  }, [loading, userRole, router]);

  if (loading || userRole !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          {loading ? (
            <p className="text-muted-foreground">Загрузка...</p>
          ) : (
            <p className="text-muted-foreground">Нет доступа.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b bg-background px-4 py-2">
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Админка
        </Link>
        <h1 className="text-lg font-semibold">Prisma Studio</h1>
        <span className="text-xs text-muted-foreground">
          Схема данных БД
        </span>
      </header>
      <main className="min-h-0 flex-1">
        <Studio adapter={adapter} />
      </main>
    </div>
  );
}
