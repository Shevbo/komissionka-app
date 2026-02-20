"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "komiss/lib/supabase-browser";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { AdminItemsTable } from "komiss/components/admin-items-table";

type Item = {
  id: string;
  title: string | null;
  price: number | null;
  status: string | null;
  created_at: string;
};

type Message = {
  id: string;
  item_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

export default function AdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [itemsCount, setItemsCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const supabase = useMemo(() => createBrowserClient(), []);

  async function fetchData() {
    const [itemsRes, messagesRes, itemsData, messagesData] = await Promise.all([
      supabase.from("items").select("*", { count: "exact", head: true }),
      supabase.from("messages").select("*", { count: "exact", head: true }),
      supabase
        .from("items")
        .select("id, title, price, status, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("id, item_id, author_name, content, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    setItemsCount(itemsRes.count ?? 0);
    setMessagesCount(messagesRes.count ?? 0);
    setItems((itemsData.data as Item[]) ?? []);
    setMessages((messagesData.data as Message[]) ?? []);
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [supabase]);

  useEffect(() => {
    const channel = supabase.channel("admin-changes").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "items" },
      (payload) => {
        console.log("Realtime payload:", payload);
        if (payload.eventType === "INSERT") {
          setItems((prev) => [payload.new as Item, ...prev]);
          setItemsCount((c) => c + 1);
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as Item;
          setItems((prev) =>
            prev.map((i) => (i.id === updated.id ? updated : i))
          );
        } else if (payload.eventType === "DELETE") {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setItems((prev) => prev.filter((i) => i.id !== deletedId));
            setItemsCount((c) => Math.max(0, c - 1));
          }
        }
      }
    ).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      (payload) => {
        console.log("Realtime payload:", payload);
        if (payload.eventType === "INSERT") {
          setMessages((prev) => [(payload.new as Message), ...prev].slice(0, 10));
          setMessagesCount((c) => c + 1);
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        } else if (payload.eventType === "DELETE") {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
            setMessagesCount((c) => Math.max(0, c - 1));
          }
          setMessagesCount((c) => Math.max(0, c - 1));
        }
      }
    ).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Подписка активна");
      } else {
        console.warn("Подписка: статус не SUBSCRIBED:", status);
      }
      setLive(status === "SUBSCRIBED");
    });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function handleDeleteItem(id: string) {
    try {
      const { data: messagesData } = await supabase
        .from("messages")
        .select("id")
        .eq("item_id", id);

      const hasMessages = messagesData && messagesData.length > 0;

      if (!hasMessages) {
        const { error } = await supabase.from("items").delete().eq("id", id);
        if (error) throw error;
        return;
      }

      const confirmed = window.confirm(
        "У этого товара есть сообщения в чате. Удалить товар вместе с перепиской?"
      );
      if (!confirmed) return;

      const { error: messagesError } = await supabase
        .from("messages")
        .delete()
        .eq("item_id", id);
      if (messagesError) throw messagesError;

      const { error: itemsError } = await supabase
        .from("items")
        .delete()
        .eq("id", id);
      if (itemsError) throw itemsError;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Неизвестная ошибка";
      const isFk =
        msg.toLowerCase().includes("foreign key") ||
        msg.toLowerCase().includes("violates foreign key");
      alert(
        isFk
          ? "Ошибка: нарушение внешнего ключа. Возможно, не удалось удалить связанные данные."
          : `Ошибка: ${msg}`
      );
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-zinc-900">
              Панель управления
            </h1>
            {live && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            )}
          </div>
          <Link
            href="/"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← На главную
          </Link>
        </div>

        {/* Статистика */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm font-medium text-muted-foreground">
                Товаров всего
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{itemsCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm font-medium text-muted-foreground">
                Сообщений всего
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{messagesCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Таблица товаров */}
        <Card className="mb-10">
          <CardHeader>
            <h2 className="text-lg font-semibold">Товары</h2>
          </CardHeader>
          <CardContent>
            {items.length > 0 ? (
              <AdminItemsTable
                items={items}
                onDelete={handleDeleteItem}
              />
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                Нет товаров
              </p>
            )}
          </CardContent>
        </Card>

        {/* Лента сообщений */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">
              Последние сообщения в чатах
            </h2>
          </CardHeader>
          <CardContent>
            {messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{msg.author_name ?? "Покупатель"}</span>
                      <span>
                        {new Date(msg.created_at).toLocaleString("ru-RU")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{msg.content}</p>
                    <Link
                      href={`/items/${msg.item_id}`}
                      className="mt-2 inline-block text-xs text-primary hover:underline"
                    >
                      К товару →
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                Нет сообщений
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
