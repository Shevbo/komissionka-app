"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "komiss/lib/supabase-browser";
import { Button } from "komiss/components/ui/button";
import type { User } from "@supabase/supabase-js";

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (loading) {
    return (
      <div className="h-10 w-20 animate-pulse rounded-md bg-muted" />
    );
  }

  if (user) {
    const displayName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "Пользователь";

    async function handleSignOut() {
      await supabase.auth.signOut();
      window.location.href = "/";
    }

    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">
          {displayName}
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href="/seller">Выставить вещь</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Выйти
        </Button>
      </div>
    );
  }

  return (
    <Button asChild size="sm">
      <Link href="/login">Войти</Link>
    </Button>
  );
}
