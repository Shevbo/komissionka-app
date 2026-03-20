"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type ChatTurn = { role: string; content: string };

type RunDetailData = {
  id: string;
  runNumber: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  conversationLog: unknown;
  testCase?: { number: number; title: string };
};

function normalizeConversationLog(log: unknown): ChatTurn[] {
  if (!Array.isArray(log)) return [];
  return log
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      role: String((x as { role?: unknown }).role ?? ""),
      content: String((x as { content?: unknown }).content ?? ""),
    }))
    .filter((x) => x.role.length > 0 || x.content.length > 0);
}

export default function TestRunInteractivePage() {
  const params = useParams<{ runId: string }>();
  const runId = params?.runId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunDetailData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!runId) return;
      try {
        const res = await fetch(`/api/admin/test-cases/runs/detail/${runId}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setError(json.error ?? "Не удалось загрузить прогон");
          return;
        }
        if (!cancelled) {
          setRun(json.data as RunDetailData);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const i = setInterval(() => {
      void load();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [runId]);

  const turns = useMemo(() => normalizeConversationLog(run?.conversationLog), [run?.conversationLog]);

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="text-xl font-semibold">Интерактив прогона</h1>
      {loading && <p className="mt-3 text-sm text-muted-foreground">Загрузка…</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {run && (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border p-3 text-sm">
            <div>
              <span className="text-muted-foreground">Прогон:</span> #{run.runNumber}
              {run.testCase?.number ? ` (кейс №${run.testCase.number})` : ""}
            </div>
            <div>
              <span className="text-muted-foreground">Статус:</span> {run.status}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(run.startedAt).toLocaleString("ru-RU")}
              {run.finishedAt ? ` → ${new Date(run.finishedAt).toLocaleString("ru-RU")}` : ""}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <h2 className="mb-2 text-sm font-medium">Имитация диалога (только просмотр)</h2>
            {turns.length === 0 ? (
              <p className="text-xs text-muted-foreground">Пока нет сообщений.</p>
            ) : (
              <div className="space-y-3">
                {turns.map((t, idx) => (
                  <div key={`${idx}-${t.role}`} className="rounded border p-2">
                    <div className="mb-1 text-[11px] text-muted-foreground">
                      {t.role === "user" ? "Пользователь" : t.role === "assistant" ? "Модель" : t.role}
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs">{t.content}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

