"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, FileText, Trash2 } from "lucide-react";
import { Button } from "komiss/components/ui/button";
import { AuthDialog } from "komiss/components/AuthDialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "komiss/components/ui/sheet";
import { useAuth } from "komiss/components/auth-provider";
import { useCart } from "komiss/store/useCart";
import { cn } from "komiss/lib/utils";

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
  }).format(price);
}

export function Navbar() {
  const { user, profile, userRole, loading, authDialogOpen, setAuthDialogOpen, signOut } = useAuth();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { items, removeItem, totalPrice } = useCart();

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
    user?.email?.split("@")[0] ??
    null;

  async function handleSignOut() {
    await signOut();
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
                <Link
                  href="/profile"
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {displayName ?? "Пользователь"}
                </Link>
                <Button asChild variant="outline" size="sm">
                  <Link href="/seller">Выставить вещь</Link>
                </Button>
                {userRole === "admin" && (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/admin">Админ. Консоль</Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-9 w-9"
                  onClick={() => setCartOpen(true)}
                  aria-label="Корзина"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {items.length > 0 && (
                    <span
                      className={cn(
                        "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                      )}
                    >
                      {items.length > 9 ? "9+" : items.length}
                    </span>
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  Выйти
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-9 w-9"
                  onClick={() => setCartOpen(true)}
                  aria-label="Корзина"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {items.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {items.length > 9 ? "9+" : items.length}
                    </span>
                  )}
                </Button>
                <Button size="sm" onClick={() => setAuthDialogOpen(true)}>
                  Войти
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="flex flex-col p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle>Корзина</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Корзина пуста</p>
            ) : (
              <ul className="space-y-3">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-3 rounded-lg border p-3"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      {item.image_urls && item.image_urls.length > 0 ? ( // Изменено на image_urls
                        <img
                          src={item.image_urls[0]}
                          alt={item.title ?? ""}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ShoppingCart className="h-6 w-6 opacity-40" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{item.title ?? "Без названия"}</p>
                      <p className="text-sm font-semibold text-primary">
                        {formatPrice(item.price)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {items.length > 0 && (
            <SheetFooter className="flex-row items-center justify-between border-t p-4">
              <span className="text-lg font-semibold">
                Итого: {formatPrice(totalPrice())}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                title="Сформировать предложение (PDF)"
                aria-label="Сформировать предложение (PDF)"
              >
                <FileText className="h-5 w-5" />
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
