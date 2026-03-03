"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type NewsItem = {
  id: string;
  title: string | null;
  body: string | null;
};

export function NewsBanner({
  news,
  heightPx,
  speedPxPerSec,
}: {
  news: NewsItem[];
  heightPx: number;
  speedPxPerSec: number;
}) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [offset, setOffset] = React.useState(0);

  React.useEffect(() => {
    if (news.length === 0 || speedPxPerSec <= 0) return;
    let rafId: number;
    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;
      const el = innerRef.current;
      const totalH = el?.scrollHeight ?? 0;
      const setH = totalH / 2;
      setOffset((prev) => {
        if (setH <= 0) return prev;
        let next = prev + speedPxPerSec * deltaSec;
        if (next >= setH) next = next % setH;
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [news.length, speedPxPerSec]);

  if (news.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-amber-200/60 bg-amber-50/95 px-6 py-8 text-center shadow-inner"
        style={{ height: heightPx }}
        aria-live="polite"
      >
        <p className="text-amber-800/90">Ждём новостей от администратора</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ height: heightPx }}
      aria-label="Новости"
    >
      <div
        ref={innerRef}
        className="flex flex-col"
        style={{ transform: `translateY(-${offset}px)` }}
      >
        {[1, 2].map((copy) => (
          <div key={copy} className="flex flex-col gap-4 px-4 py-3">
            {news.map((n) => (
              <article
                key={`${copy}-${n.id}`}
                className="rounded-xl border border-amber-200/50 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm"
              >
                <h3 className="text-sm font-semibold text-amber-900">
                  {n.title ?? "Без заголовка"}
                </h3>
                <div className="mt-1 text-sm text-amber-800/90">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {n.body ?? ""}
                  </ReactMarkdown>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
