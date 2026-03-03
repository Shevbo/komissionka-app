"use client";

import { useEffect, useState } from "react";

type Report = {
  timestamp?: string;
  cwd?: string;
  checks?: {
    files?: Record<string, boolean>;
    itemsSample?: Array<{
      id: string;
      title: string | null;
      image_url: string | null;
      image_urls: string[];
      resolvedFirst: string | null;
    }>;
    urlPrefixesInDb?: string[];
    recommendations?: string[];
    dbError?: string;
  };
};

export default function DiagnoseImagesPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/diagnose-images")
      .then((r) => r.json())
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8">Загрузка...</div>;
  if (error) return <div className="p-8 text-red-600">Ошибка: {error}</div>;

  const c = report?.checks;
  return (
    <div className="mx-auto max-w-3xl p-8 font-mono text-sm">
      <h1 className="mb-6 text-xl font-bold">Диагностика фото товаров</h1>
      <pre className="overflow-auto rounded-lg bg-zinc-100 p-4">{JSON.stringify(report, null, 2)}</pre>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Инструкции для тестировщика</h2>
        <ol className="list-inside list-decimal space-y-2 text-zinc-700">
          <li>Откройте главную страницу — каталог товаров. Видны ли фото или «Нет фото»?</li>
          <li>Откройте DevTools (F12) → вкладка Network. Обновите страницу. Найдите запросы к /images/placeholder.svg или /api/placeholder. Какой статус (200, 404)?</li>
          <li>Проверьте в браузере напрямую:
            <ul className="ml-6 mt-1 list-disc">
              <li><a href="/images/placeholder.svg" target="_blank" rel="noopener" className="text-primary underline">/images/placeholder.svg</a></li>
              <li><a href="/api/placeholder?w=400&h=400" target="_blank" rel="noopener" className="text-primary underline">/api/placeholder?w=400&h=400</a></li>
            </ul>
          </li>
          <li>Оба должны возвращать SVG-картинку. Применён rewrite: /images/placeholder.svg → /api/placeholder. После деплоя выполните на сервере: <code className="rounded bg-zinc-200 px-1">npx tsx scripts/fix-placeholder-urls.ts</code> — заменит старые URL в БД на /api/placeholder.</li>
        </ol>
      </section>

      {c?.recommendations && c.recommendations.length > 0 && (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-900">Рекомендации</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
            {c.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
