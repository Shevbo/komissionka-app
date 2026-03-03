"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "komiss/components/auth-provider";
import { Button } from "komiss/components/ui/button";
import { Input } from "komiss/components/ui/input";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { Paperclip, X } from "lucide-react";


type Message = {
  id: string;
  item_id: string;
  author_name: string | null;
  content: string;
  attachments?: string[];
  created_at: string;
};

type Props = {
  itemId: string;
};

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;

export function ItemChat({ itemId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ url: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, profile, setAuthDialogOpen } = useAuth();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/messages?item_id=${encodeURIComponent(itemId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setMessages(data.messages ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Ошибка загрузки сообщений");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [itemId]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !user) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      Array.from(files).slice(0, 5).forEach((f) => formData.append("files", f));
      const res = await fetch("/api/upload/chat", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      const urls = data.urls ?? [];
      setPendingFiles((prev) => [...prev, ...urls.map((url: string) => ({ url, name: url.split("/").pop() ?? "файл" }))]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки файлов");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removePendingFile(url: string) {
    setPendingFiles((prev) => prev.filter((f) => f.url !== url));
  }

  async function handleSend() {
    const text = input.trim();
    const attachments = pendingFiles.map((f) => f.url);
    if ((!text && attachments.length === 0) || sending) return;

    if (!user) {
      setAuthDialogOpen(true);
      return;
    }

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          content: text || "(вложение)",
          author_name: profile?.full_name ?? "Гость",
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка отправки");
        return;
      }
      setMessages((prev) => [...prev, data]);
      setInput("");
      setPendingFiles([]);
    } catch {
      setError("Ошибка отправки");
    } finally {
      setSending(false);
    }
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
                className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm"
              >
                <p className="whitespace-pre-wrap break-words text-sm">
                  {msg.content}
                </p>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {msg.attachments.map((url) =>
                      IMAGE_EXT.test(url) ? (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border border-white/30"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Вложение"
                            className="h-24 w-24 object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                        >
                          📎 {url.split("/").pop()}
                        </a>
                      )
                    )}
                  </div>
                )}
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

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-2">
            {pendingFiles.map(({ url, name }) => (
              <span
                key={url}
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
              >
                {IMAGE_EXT.test(url) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={url} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span className="text-xs">📎</span>
                )}
                <span className="max-w-[100px] truncate">{name}</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(url)}
                  className="rounded p-0.5 hover:bg-muted-foreground/20"
                  aria-label="Удалить"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploading}
            title="Прикрепить файл или фото"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
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
            disabled={sending || (!input.trim() && pendingFiles.length === 0)}
            className="shrink-0"
          >
            Отправить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
