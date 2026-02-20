"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "komiss/lib/supabase-browser";
import { useAuth } from "komiss/components/auth-provider";
import { Button } from "komiss/components/ui/button";
import { Input } from "komiss/components/ui/input";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { cn } from "komiss/lib/utils";

type Message = {
  id: string;
  item_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

type Props = {
  itemId: string;
};

export function ItemChat({ itemId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { profile, setAuthDialogOpen } = useAuth();
  const supabase = useMemo(() => createBrowserClient(), []);

  // Загрузка сообщений (sender_id ссылается на profiles — чтение не требует авторизации)
  useEffect(() => {
    async function fetchMessages() {
      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("id, item_id, author_name, content, created_at")
        .eq("item_id", itemId)
        .order("created_at", { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setMessages((data as Message[]) ?? []);
      }
      setLoading(false);
    }
    fetchMessages();
  }, [itemId, supabase]);

  // Realtime подписка
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "item_id=eq." + itemId,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId, supabase]);

  // Скролл вниз при новых сообщениях
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAuthDialogOpen(true);
      setSending(false);
      return;
    }

    const author = profile?.full_name ?? "Анонимный пользователь";

    const { error: insertError } = await supabase.from("messages").insert({
      item_id: itemId,
      content: text,
      author_name: author,
      sender_id: user.id,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setInput("");
    }
    setSending(false);
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">Чат с продавцом</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          ref={listRef}
          className="flex max-h-[320px] min-h-[200px] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-4"
        >
          {loading ? (
            <p className="text-center text-muted-foreground">Загрузка...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground">
              Пока нет сообщений. Напишите первым!
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm",
                  "bg-primary text-primary-foreground",
                  "rounded-br-md self-end"
                )}
              >
                <p className="whitespace-pre-wrap break-words text-sm">
                  {msg.content}
                </p>
                <div className="mt-1 flex items-center justify-end gap-2 text-xs opacity-90">
                  <span>{msg.author_name ?? "Анонимный пользователь"}</span>
                  <span>{formatTime(msg.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            placeholder="Введите сообщение..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="shrink-0"
          >
            Отправить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
