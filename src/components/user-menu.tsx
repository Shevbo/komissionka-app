"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "komiss/components/ui/button";
import { useAuth } from "komiss/components/auth-provider";

export function UserMenu() {
  const { data: session, status } = useSession();
  const { profile, signOut } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(status === "loading");
  }, [status]);

  if (loading) {
    return <div className="h-10 w-20 animate-pulse rounded-md bg-muted" />;
  }

  if (session?.user) {
    const displayName =
      profile?.full_name ??
      (session.user as { name?: string }).name ??
      session.user.email?.split("@")[0] ??
      "Пользователь";

    return (
      <div className="flex items-center gap-3">
        <Link
          href="/profile"
          className="text-sm font-medium text-foreground hover:underline"
        >
          {displayName}
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/seller">Выставить вещь</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>
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
