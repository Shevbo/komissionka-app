"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { Input } from "komiss/components/ui/input";
import { Button } from "komiss/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "komiss/components/ui/table";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";

type CacheRow = {
  id: string;
  created_at: string;
  user_account: string | null;
  llm_model: string | null;
  project: string;
  environment: string;
  mode: string;
  chat_name: string | null;
  topic: string | null;
  prompt: string;
  response: string;
  words_sent: number;
  words_received: number;
};

export function AgentCacheBrowser() {
  const [project, setProject] = useState("Комиссионка");
  const [topicPattern, setTopicPattern] = useState("");
  const [promptPattern, setPromptPattern] = useState("");
  const [rows, setRows] = useState<CacheRow[]>([]);
  const [sizeMb, setSizeMb] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCache = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (project) params.set("project", project);
      if (topicPattern) params.set("topicPattern", topicPattern);
      if (promptPattern) params.set("promptPattern", promptPattern);
      params.set("limit", "20");
      const res = await fetch(`/api/admin/agent/cache?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        rows: CacheRow[];
        sizeMb: string;
      };
      setRows(data.rows);
      setSizeMb(data.sizeMb);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки кэша");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [project, topicPattern, promptPattern]);

  useEffect(() => {
    fetchCache();
  }, [fetchCache]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} скопировано`);
  };

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    if (topicPattern) params.set("topicPattern", topicPattern);
    if (promptPattern) params.set("promptPattern", promptPattern);
    params.set("export", "1");
    window.open(`/api/admin/agent/cache?${params}`, "_blank", "noopener");
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Браузер кэша промптов</h2>
        <p className="text-sm text-muted-foreground">
          Размер кэша: {sizeMb ?? "—"} МБ. Фильтр по колонкам, копирование в буфер, экспорт в CSV.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Проект</label>
            <Input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Комиссионка"
              className="w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Тема (*API*)</label>
            <Input
              value={topicPattern}
              onChange={(e) => setTopicPattern(e.target.value)}
              placeholder="*API*"
              className="w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Промпт (*сбой*)</label>
            <Input
              value={promptPattern}
              onChange={(e) => setPromptPattern(e.target.value)}
              placeholder="*сбой*"
              className="w-40"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={fetchCache} disabled={loading} size="sm">
              {loading ? "Загрузка…" : "Обновить"}
            </Button>
            <Button onClick={exportCsv} variant="outline" size="sm">
              <Download className="mr-1 h-4 w-4" />
              Экспорт CSV
            </Button>
          </div>
        </div>

        {rows.length === 0 && !loading ? (
          <p className="py-8 text-center text-muted-foreground">Записей не найдено</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Модель</TableHead>
                  <TableHead>Режим</TableHead>
                  <TableHead>Чат</TableHead>
                  <TableHead>Тема</TableHead>
                  <TableHead>Промпт</TableHead>
                  <TableHead>Ответ</TableHead>
                  <TableHead className="w-24">Копировать</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.created_at).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{r.llm_model ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.mode}</TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">{r.chat_name ?? "—"}</TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">{r.topic ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs" title={r.prompt}>
                      {r.prompt.slice(0, 80)}…
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs" title={r.response}>
                      {r.response.slice(0, 80)}…
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1"
                          onClick={() => copyToClipboard(r.prompt, "Промпт")}
                          title="Копировать промпт"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1"
                          onClick={() => copyToClipboard(r.response, "Ответ")}
                          title="Копировать ответ"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
