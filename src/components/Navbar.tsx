"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "komiss/components/ui/button";
import { AuthDialog } from "komiss/components/AuthDialog";
import { useAuth } from "komiss/components/auth-provider";

export function Navbar() {
  const router = useRouter();
  const { user, profile, loading, authDialogOpen, setAuthDialogOpen, clearAuth } = useAuth();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoadingTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!loading) setLoadingTimedOut(false);
  }, [loading]);

  const showSkeleton = loading && !loadingTimedOut;

  const displayName =
    profile?.full_name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    null;

  async function handleSignOut() {
    const { createBrowserClient } = await import("komiss/lib/supabase-browser");
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    clearAuth();
    router.refresh();
    window.location.href = "/";
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold">
            Комиссионка
          </Link>
          <div className="flex items-center gap-3">
            {showSkeleton ? (
              <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <>
                <span className="text-sm font-medium text-foreground">
                  {displayName ?? "Пользователь"}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link href="/seller">Выставить вещь</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  Выйти
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setAuthDialogOpen(true)}>
                Войти
              </Button>
            )}
          </div>
        </div>
      </header>
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </>
  );
}
