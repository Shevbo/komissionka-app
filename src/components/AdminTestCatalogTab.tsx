"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { Button } from "komiss/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "komiss/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "komiss/components/ui/dialog";
import { Input } from "komiss/components/ui/input";
import { Textarea } from "komiss/components/ui/textarea";
import { Label } from "komiss/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "komiss/components/ui/select";
import { toast } from "sonner";
import { Play, RefreshCw } from "lucide-react";

type SuccessRate = { percent: number; successCount: number; totalCount: number };

export type TestCaseRow = {
  id: string;
  number: number;
  moduleId: string;
  title: string;
  description: string;
  kind: string;
  scope: string;
  promptTemplate: string | null;
  parameters: unknown;
  expectedResult: unknown;
  tags: string[];
  enabled: boolean;
  uiPages: string[];
  apiEndpoints: string[];
  codeRefs: string[];
  dbEntities: string[];
  specEnrichedByAI: boolean;
  specEnrichedAt: string | null;
  specEnrichedModel: string | null;
  runsCount: number;
  lastStatus: string | null;
  lastRunAt: string | null;
  successRate: SuccessRate | null;
};

type TestRunRow = {
  id: string;
  testCaseId: string;
  runNumber: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  runner: string | null;
  agentLogId: string | null;
  statusDumpPath: string | null;
  comparisonResult: unknown;
};

type RunDetailData = {
  id: string;
  testCaseId: string;
  runNumber: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  runner: string | null;
  requestContext: unknown;
  agentLogId: string | null;
  statusDumpPath: string | null;
  conversationLog: unknown;
  steps: unknown;
  comparisonResult: unknown;
  diagnostics: unknown;
  testCase: { id: string; number: number; title: string; module_id: string };
};

function statusClass(status: string | null): string {
  if (!status) return "text-muted-foreground";
  if (status === "success") return "text-emerald-700 font-medium";
  if (status === "failed") return "text-red-700 font-medium";
  if (status === "error") return "text-orange-700 font-medium";
  if (status === "running" || status === "pending") return "text-blue-700 font-medium";
  return "text-muted-foreground";
}

export function AdminTestCatalogTab() {
  const [cases, setCases] = useState<TestCaseRow[]>([]);
  const [modules, setModules] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<TestCaseRow | null>(null);
  const [runs, setRuns] = useState<TestRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [runDetail, setRunDetail] = useState<RunDetailData | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [formNumber, setFormNumber] = useState("");
  const [formModuleId, setFormModuleId] = useState("app");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formScope, setFormScope] = useState("agent");
  const [formKind, setFormKind] = useState("automatic");
  const [formParametersJson, setFormParametersJson] = useState("{}");

  const loadModules = useCallback(async () => {
    const res = await fetch("/api/admin/test-modules", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setModules([]);
      return;
    }
    const list = (json.data ?? []) as Array<{ id: string; name: string }>;
    setModules(list);
  }, []);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/test-cases", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Не удалось загрузить тест-кейсы");
        setCases([]);
        return;
      }
      setCases((json.data ?? []) as TestCaseRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModules();
    void loadCases();
  }, [loadCases, loadModules]);

  const loadRuns = useCallback(async (testCaseId: string) => {
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/admin/test-cases/runs/${testCaseId}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Не удалось загрузить прогоны");
        setRuns([]);
        return;
      }
      setRuns((json.data ?? []) as TestRunRow[]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCase) void loadRuns(selectedCase.id);
    else setRuns([]);
  }, [selectedCase, loadRuns]);

  const openRunDetail = async (runId: string) => {
    setRunDetailOpen(true);
    setRunDetailLoading(true);
    setRunDetail(null);
    try {
      const res = await fetch(`/api/admin/test-cases/runs/detail/${runId}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Не удалось загрузить прогон");
        return;
      }
      setRunDetail(json.data as RunDetailData);
    } finally {
      setRunDetailLoading(false);
    }
  };

  const runTest = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/admin/test-cases/${id}/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Запуск не удался");
        return;
      }
      toast.success(`Прогон завершён: ${json.data?.status ?? "?"}`);
      await loadCases();
      if (selectedCase?.id === id) await loadRuns(id);
    } finally {
      setRunningId(null);
    }
  };

  const submitCreate = async () => {
    const num = parseInt(formNumber, 10);
    if (!num || Number.isNaN(num)) {
      toast.error("Укажите корректный номер тест-кейса");
      return;
    }
    let parameters: unknown = {};
    if (formParametersJson.trim()) {
      try {
        parameters = JSON.parse(formParametersJson) as unknown;
      } catch {
        toast.error("JSON параметров некорректен");
        return;
      }
    }
    setCreateSaving(true);
    try {
      const res = await fetch("/api/admin/test-cases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: num,
          moduleId: formModuleId,
          title: formTitle.trim(),
          description: formDescription,
          scope: formScope,
          kind: formKind,
          parameters,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Не удалось создать тест-кейс");
        return;
      }
      toast.success("Тест-кейс создан");
      setCreateOpen(false);
      setFormNumber("");
      setFormTitle("");
      setFormDescription("");
      setFormParametersJson("{}");
      await loadCases();
    } finally {
      setCreateSaving(false);
    }
  };

  const formatSuccessRate = (sr: SuccessRate | null) => {
    if (!sr || sr.totalCount === 0) return "—";
    return `${sr.percent}% (${sr.successCount}/${sr.totalCount})`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Каталог тест-кейсов</h2>
            <p className="text-sm text-muted-foreground">
              Универсальные сценарии для web, агента, API и др. Запуск:{" "}
              <code className="rounded bg-muted px-1">POST /api/admin/test-cases/[id]/run</code>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadCases()} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Обновить
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={modules.length === 0}>
              Новый тест-кейс
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {modules.length === 0 && !loading && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Справочник модулей пуст. Примените миграции Prisma (в т.ч. seed{" "}
              <code className="rounded bg-white px-1">test_modules</code>), затем обновите страницу.
            </p>
          )}
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Загрузка…</p>
          ) : cases.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Нет тест-кейсов</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">№</TableHead>
                    <TableHead>Модуль</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Прогонов</TableHead>
                    <TableHead>Последний</TableHead>
                    <TableHead>Успех %</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono">{c.number}</TableCell>
                      <TableCell>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.moduleId}</span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={c.title}>
                        {c.title}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.scope}</TableCell>
                      <TableCell className="text-right">{c.runsCount}</TableCell>
                      <TableCell>
                        <span className={statusClass(c.lastStatus)}>
                          {c.lastStatus ?? "—"}
                        </span>
                        {c.lastRunAt && (
                          <div className="text-xs text-muted-foreground">
                            {new Date(c.lastRunAt).toLocaleString("ru-RU")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatSuccessRate(c.successRate)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => setSelectedCase(c)}>
                          Карточка
                        </Button>
                        <Button
                          size="sm"
                          disabled={runningId === c.id || !c.enabled}
                          onClick={() => void runTest(c.id)}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Запустить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedCase} onOpenChange={(o) => !o && setSelectedCase(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Тест-кейс №{selectedCase?.number}: {selectedCase?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedCase && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Модуль:</span> {selectedCase.moduleId}
                </div>
                <div>
                  <span className="text-muted-foreground">Kind / scope:</span>{" "}
                  {selectedCase.kind} / {selectedCase.scope}
                </div>
                <div>
                  <span className="text-muted-foreground">Прогонов:</span> {selectedCase.runsCount}
                </div>
                <div>
                  <span className="text-muted-foreground">Успешность:</span>{" "}
                  {formatSuccessRate(selectedCase.successRate)}
                </div>
              </div>
              <div>
                <h3 className="mb-1 font-medium">Описание</h3>
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">
                  {selectedCase.description}
                </pre>
              </div>
              {(selectedCase.uiPages.length > 0 ||
                selectedCase.apiEndpoints.length > 0 ||
                selectedCase.codeRefs.length > 0 ||
                selectedCase.dbEntities.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedCase.uiPages.length > 0 && (
                    <div>
                      <h3 className="mb-1 font-medium">Страницы UI</h3>
                      <ul className="list-inside list-disc text-xs">
                        {selectedCase.uiPages.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedCase.apiEndpoints.length > 0 && (
                    <div>
                      <h3 className="mb-1 font-medium">API</h3>
                      <ul className="list-inside list-disc text-xs">
                        {selectedCase.apiEndpoints.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedCase.codeRefs.length > 0 && (
                    <div>
                      <h3 className="mb-1 font-medium">Код</h3>
                      <ul className="list-inside list-disc text-xs">
                        {selectedCase.codeRefs.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedCase.dbEntities.length > 0 && (
                    <div>
                      <h3 className="mb-1 font-medium">Модели БД</h3>
                      <ul className="list-inside list-disc text-xs">
                        {selectedCase.dbEntities.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {selectedCase.promptTemplate && (
                <div>
                  <h3 className="mb-1 font-medium">Шаблон промпта</h3>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs">
                    {selectedCase.promptTemplate}
                  </pre>
                </div>
              )}
              <div>
                <h3 className="mb-1 font-medium">Параметры (JSON)</h3>
                <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
                  {JSON.stringify(selectedCase.parameters ?? {}, null, 2)}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void runTest(selectedCase.id)}
                  disabled={runningId === selectedCase.id}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Запустить сейчас
                </Button>
              </div>
              <div>
                <h3 className="mb-2 font-medium">История прогонов</h3>
                {runsLoading ? (
                  <p className="text-muted-foreground">Загрузка…</p>
                ) : runs.length === 0 ? (
                  <p className="text-muted-foreground">Пока нет прогонов</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Начало</TableHead>
                          <TableHead>Runner</TableHead>
                          <TableHead className="text-right">Подробнее</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.runNumber}</TableCell>
                            <TableCell>
                              <span className={statusClass(r.status)}>{r.status}</span>
                            </TableCell>
                            <TableCell className="text-xs">
                              {new Date(r.startedAt).toLocaleString("ru-RU")}
                            </TableCell>
                            <TableCell className="text-xs">{r.runner ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => void openRunDetail(r.id)}>
                                Открыть
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={runDetailOpen} onOpenChange={setRunDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Прогон #{runDetail?.runNumber ?? "—"}{" "}
              {runDetail?.testCase ? `(кейс №${runDetail.testCase.number})` : ""}
            </DialogTitle>
          </DialogHeader>
          {runDetailLoading && <p className="text-muted-foreground">Загрузка…</p>}
          {!runDetailLoading && runDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Статус:</span>{" "}
                  <span className={statusClass(runDetail.status)}>{runDetail.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Runner:</span> {runDetail.runner ?? "—"}
                </div>
                <div className="sm:col-span-2 text-xs text-muted-foreground">
                  {new Date(runDetail.startedAt).toLocaleString("ru-RU")}
                  {runDetail.finishedAt &&
                    ` → ${new Date(runDetail.finishedAt).toLocaleString("ru-RU")}`}
                </div>
              </div>
              {runDetail.agentLogId && (
                <div>
                  <a
                    className="text-primary underline"
                    href={`/api/admin/agent/log?logId=${encodeURIComponent(runDetail.agentLogId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Лог рассуждений агента
                  </a>
                </div>
              )}
              {runDetail.statusDumpPath && (
                <div className="text-xs break-all">
                  <span className="text-muted-foreground">Дамп:</span> {runDetail.statusDumpPath}
                </div>
              )}
              <div>
                <h4 className="mb-1 font-medium">Сравнение с ожиданиями</h4>
                <pre className="max-h-48 overflow-auto rounded-md border p-2 text-xs">
                  {JSON.stringify(runDetail.comparisonResult ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-1 font-medium">Шаги</h4>
                <pre className="max-h-48 overflow-auto rounded-md border p-2 text-xs">
                  {JSON.stringify(runDetail.steps ?? [], null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-1 font-medium">Диагностика</h4>
                <pre className="max-h-48 overflow-auto rounded-md border p-2 text-xs">
                  {JSON.stringify(runDetail.diagnostics ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый тест-кейс</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="tc-num">Номер (уникальный)</Label>
              <Input
                id="tc-num"
                type="number"
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <Label>Модуль</Label>
              <Select value={formModuleId} onValueChange={setFormModuleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tc-title">Название</Label>
              <Input
                id="tc-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Краткое название"
              />
            </div>
            <div>
              <Label htmlFor="tc-desc">Описание</Label>
              <Textarea
                id="tc-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={4}
                placeholder="Сценарий тестирования"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Scope</Label>
                <Select value={formScope} onValueChange={setFormScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ui">ui</SelectItem>
                    <SelectItem value="api">api</SelectItem>
                    <SelectItem value="agent">agent</SelectItem>
                    <SelectItem value="telegram">telegram</SelectItem>
                    <SelectItem value="db">db</SelectItem>
                    <SelectItem value="infra">infra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kind</Label>
                <Select value={formKind} onValueChange={setFormKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual-guided">manual-guided</SelectItem>
                    <SelectItem value="semi-automatic">semi-automatic</SelectItem>
                    <SelectItem value="automatic">automatic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="tc-params">Параметры (JSON)</Label>
              <Textarea
                id="tc-params"
                value={formParametersJson}
                onChange={(e) => setFormParametersJson(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                placeholder='{"model":"...","mode":"dev","userPrompt":"...","expectedText":"..."}'
              />
            </div>
            <Button onClick={() => void submitCreate()} disabled={createSaving}>
              {createSaving ? "Сохранение…" : "Создать"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
