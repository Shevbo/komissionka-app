"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "komiss/components/auth-provider";
import "@xterm/xterm/css/xterm.css";

const PROMPT = "$ ";

export default function AdminTerminalPage() {
  const router = useRouter();
  const { userRole, loading } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (userRole !== "admin") {
      router.replace("/");
      return;
    }
  }, [loading, userRole, router]);

  useEffect(() => {
    if (!containerRef.current || userRole !== "admin") return;
    let cancelled = false;
    let inputBuffer = "";

    const init = async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "Consolas, Monaco, monospace",
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);
      fitAddon.fit();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      term.writeln(`Терминал сервера (ssh hoster, cwd: ~/komissionka, base: ${origin})`);
      term.writeln("Введите команду и нажмите Enter. Ограничение: одна команда за раз.\r\n");
      term.write(PROMPT);

      term.onData((data) => {
        if (cancelled) return;
        if (data === "\r" || data === "\n") {
          const cmd = inputBuffer.trim();
          inputBuffer = "";
          if (!cmd) {
            term.writeln("");
            term.write(PROMPT);
            return;
          }
          term.writeln("");
          fetch("/api/admin/terminal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: cmd }),
            credentials: "include",
          }).then(async (res) => {
            if (!res.ok) {
              const err = await res.text();
              term.writeln("Ошибка: " + err);
              term.write(PROMPT);
              return;
            }
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) {
              term.write(PROMPT);
              return;
            }
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              // Нормализуем переводы строк для корректного отображения в xterm
              term.write(chunk.replace(/\r?\n/g, "\r\n"));
            }
            term.writeln("");
            term.write(PROMPT);
          }).catch((err) => {
            term.writeln("Ошибка: " + (err?.message || String(err)));
            term.write(PROMPT);
          });
        } else if (data === "\u007F" || data === "\b") {
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
            term.write("\b \b");
          }
        } else {
          inputBuffer += data;
          term.write(data);
        }
      });

      window.addEventListener("resize", () => fitAddon.fit());
      setReady(true);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [userRole]);

  if (loading || userRole !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          {loading ? <p className="text-muted-foreground">Загрузка...</p> : <p className="text-muted-foreground">Нет доступа.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-900">
      <header className="flex shrink-0 items-center gap-4 border-b border-zinc-700 bg-zinc-800 px-4 py-2">
        <Link href="/admin" className="text-sm text-zinc-300 hover:text-white">← Админка</Link>
        <h1 className="text-lg font-semibold text-white">Терминал SSH</h1>
        <span className="text-xs text-zinc-400">Команды на сервере</span>
      </header>
      <main className="min-h-0 flex-1 p-2">
        <div ref={containerRef} className="h-full min-h-[400px] w-full" />
      </main>
    </div>
  );
}
