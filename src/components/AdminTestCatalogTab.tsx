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
import { Copy, Download, Pencil, Play, RefreshCw, Sparkles, Upload } from "lucide-react";

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

function hasAgentExpectedText(parameters: unknown): boolean {
  if (!parameters || typeof parameters !== "object") return false;
  const p = parameters as Record<string, unknown>;
  const expectedText = typeof p.expectedText === "string" ? p.expectedText : "";
  return expectedText.trim().length > 0;
}

function normalizeConversationLog(log: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(log)) return [];
  const out: Array<{ role: string; content: string }> = [];
  for (const t of log) {
    if (!t || typeof t !== "object") continue;
    const role = (t as { role?: unknown }).role;
    const content = (t as { content?: unknown }).content;
    if (typeof role === "string" && typeof content === "string") out.push({ role, content });
  }
  return out;
}

export function AdminTestCatalogTab() {
  const [cases, setCases] = useState<TestCaseRow[]>([]);
  const [modules, setModules] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<TestCaseRow | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [runs, setRuns] = useState<TestRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [runDetail, setRunDetail] = useState<RunDetailData | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [caseFormOpen, setCaseFormOpen] = useState(false);
  const [caseFormMode, setCaseFormMode] = useState<"create" | "edit">("create");
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [caseFormSaving, setCaseFormSaving] = useState(false);
  const [formNumber, setFormNumber] = useState("");
  const [formModuleId, setFormModuleId] = useState("app");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formScope, setFormScope] = useState("agent");
  const [formKind, setFormKind] = useState("automatic");
  const [formParametersJson, setFormParametersJson] = useState("{}");
  const [formPromptTemplate, setFormPromptTemplate] = useState("");
  const [formExpectedResultJson, setFormExpectedResultJson] = useState("{}");
  const [formEnabled, setFormEnabled] = useState(true);

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

  const resetCaseForm = () => {
    setCaseFormMode("create");
    setEditingCaseId(null);
    setFormNumber("");
    setFormModuleId("app");
    setFormTitle("");
    setFormDescription("");
    setFormScope("agent");
    setFormKind("automatic");
    setFormParametersJson("{}");
    setFormPromptTemplate("");
    setFormExpectedResultJson("{}");
    setFormEnabled(true);
  };

  const openCaseFormCreate = () => {
    resetCaseForm();
    setCaseFormMode("create");
    setCaseFormOpen(true);
  };

  const openCaseFormEdit = (c: TestCaseRow) => {
    setCaseFormMode("edit");
    setEditingCaseId(c.id);
    setFormNumber(String(c.number));
    setFormModuleId(c.moduleId);
    setFormTitle(c.title);
    setFormDescription(c.description);
    setFormScope(c.scope);
    setFormKind(c.kind);
    setFormParametersJson(JSON.stringify(c.parameters ?? {}, null, 2));
    setFormPromptTemplate(c.promptTemplate ?? "");
    setFormExpectedResultJson(JSON.stringify(c.expectedResult ?? {}, null, 2));
    setFormEnabled(c.enabled);
    setCaseFormOpen(true);
  };

  const copyTestCase = async (sourceId: string) => {
    try {
      const res = await fetch("/api/admin/test-cases", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyFromId: sourceId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Не удалось скопировать");
        return;
      }
      const num = (json.data as { number?: number })?.number;
      toast.success(num != null ? `Создана копия: тест-кейс №${num}` : "Копия создана");
      await loadCases();
    } catch {
      toast.error("Ошибка сети");
    }
  };

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
    const tc = cases.find((c) => c.id === id);
    if (tc && tc.scope === "agent" && !hasAgentExpectedText(tc.parameters)) {
      toast.error("Для scope=agent нужен expectedText. Сначала нажмите «Обогатить спецификацию тест‑кейса с ИИ».");
      return;
    }
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

  const stopRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/admin/test-cases/runs/cancel/${runId}`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Не удалось остановить прогон");
        return;
      }
      toast.success("Прогон прерван администратором");
      await loadCases();
      if (selectedCase) await loadRuns(selectedCase.id);
      if (runDetail?.id === runId) await openRunDetail(runId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка остановки прогона");
    }
  };

  const downloadRunExportJson = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/test-cases/runs/export/${id}`, { credentials: "include" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error((json as { error?: string }).error ?? "Не удалось скачать экспорт");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let filename = `test-run-${id}.json`;
      const m = cd?.match(/filename="([^"]+)"/);
      if (m?.[1]) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON скачан — прикрепите к чату ИИ или загрузите в облако");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка скачивания");
    }
  };

  const sendRunExportWebhook = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/test-cases/runs/export/${id}/webhook`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        ok?: boolean;
        webhookStatus?: number;
        webhookSnippet?: string;
      };
      if (res.status === 501) {
        toast.message(json.hint ?? json.error ?? "Вебхук не настроен (TEST_RUN_EXPORT_WEBHOOK_URL)");
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      if (json.ok) toast.success(`Вебхук принял: HTTP ${json.webhookStatus ?? "?"}`);
      else toast.warning(json.webhookSnippet?.slice(0, 120) ?? "Вебхук вернул ошибку");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    }
  };

  function extractJsonObject(text: string): any | null {
    const cleaned = text
      .replace(/```[a-zA-Z0-9_-]*\n/g, "")
      .replace(/```/g, "")
      .trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }

  const enrichSpecification = async () => {
    if (!selectedCase) return;
    if (enrichLoading) return;

    setEnrichLoading(true);
    try {
      const modelId = "gemini-3-pro-preview";
      const prompt = [
        "Ты ведущий тестировщик и архитектор покрытия.",
        "Проанализируй тест‑кейс и обогати его техническую спецификацию.",
        "",
        "Требования к ответу:",
        "- Верни ТОЛЬКО валидный JSON (без markdown, без комментариев).",
        "- JSON должен содержать ключи: description, uiPages, apiEndpoints, codeRefs, dbEntities.",
        "- uiPages: массив строк (путей/эндпоинтов UI страниц), apiEndpoints: массив строк вида /api/... (без params),",
        "  codeRefs: массив строк (пути к файлам и/или сигнатуры функций), dbEntities: массив строк (имена Prisma моделей).",
        "- description: перепиши профессионально и структурно, сохраняя смысл теста.",
        "- parameters: обязательно вернуть объект с минимум ключами: model, mode, userPrompt, expectedText (для scope=agent).",
        "  model и mode должны быть в тех же человекочитаемых значениях, как в UI (например \"Gemini 3 Pro\", \"Разработка\"),",
        "  userPrompt и expectedText должны быть конкретными строками для сравнения результата.",
        "- promptTemplate и expectedResult: можешь вернуть при наличии/уместности (необязательно).",
        "",
        "Исходные данные тест‑кейса:",
        `number: ${selectedCase.number}`,
        `moduleId: ${selectedCase.moduleId}`,
        `kind: ${selectedCase.kind}`,
        `scope: ${selectedCase.scope}`,
        `description:\n${selectedCase.description}`,
        `promptTemplate:\n${selectedCase.promptTemplate ?? "—"}`,
        `parameters (JSON):\n${JSON.stringify(selectedCase.parameters ?? {}, null, 2)}`,
        `expectedResult (JSON):\n${JSON.stringify(selectedCase.expectedResult ?? {}, null, 2)}`,
      ].join("\n");

      const res = await fetch("/api/admin/agent/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          history: [],
          stream: false,
          mode: "consult",
          project: "Комиссионка",
          chatName: `test-case:${selectedCase.number}`,
          model: modelId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось запустить ИИ для обогащения");
        return;
      }

      const payload = extractJsonObject(String(data.result ?? ""));
      if (!payload) {
        toast.error("ИИ вернул невалидный JSON. Открой диагностику/запусти ещё раз.");
        return;
      }

      const inferredParameters =
        payload.parameters && typeof payload.parameters === "object"
          ? payload.parameters
          : {
              model: payload.model,
              mode: payload.mode,
              userPrompt: payload.userPrompt,
              expectedText: payload.expectedText,
            };

      const updatedBody: Record<string, unknown> = {
        id: selectedCase.id,
        description: payload.description,
        uiPages: Array.isArray(payload.uiPages) ? payload.uiPages.map((x: any) => String(x)) : [],
        apiEndpoints: Array.isArray(payload.apiEndpoints) ? payload.apiEndpoints.map((x: any) => String(x)) : [],
        codeRefs: Array.isArray(payload.codeRefs) ? payload.codeRefs.map((x: any) => String(x)) : [],
        dbEntities: Array.isArray(payload.dbEntities) ? payload.dbEntities.map((x: any) => String(x)) : [],
        parameters: inferredParameters,
        // Заполним только если ИИ реально вернул эти поля
        promptTemplate: typeof payload.promptTemplate === "string" ? payload.promptTemplate : undefined,
        expectedResult: payload.expectedResult ?? undefined,
      };

      // PUT /api/admin/test-cases ожидает частичные обновления.
      const putRes = await fetch("/api/admin/test-cases", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedBody),
      });
      const putJson = await putRes.json().catch(() => ({}));
      if (!putRes.ok) {
        toast.error(putJson.error ?? "Не удалось обновить тест‑кейс");
        return;
      }

      toast.success("Спецификация тест‑кейса обогащена");
      await loadCases();
    } finally {
      setEnrichLoading(false);
    }
  };

  const submitCaseForm = async () => {
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
    let expectedResult: unknown = undefined;
    if (formExpectedResultJson.trim()) {
      try {
        expectedResult = JSON.parse(formExpectedResultJson) as unknown;
      } catch {
        toast.error("JSON expectedResult некорректен");
        return;
      }
    }
    setCaseFormSaving(true);
    try {
      if (caseFormMode === "edit" && editingCaseId) {
        const res = await fetch("/api/admin/test-cases", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingCaseId,
            number: num,
            moduleId: formModuleId,
            title: formTitle.trim(),
            description: formDescription,
            scope: formScope,
            kind: formKind,
            parameters,
            promptTemplate: formPromptTemplate.trim() || null,
            expectedResult,
            enabled: formEnabled,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(typeof json.error === "string" ? json.error : "Не удалось сохранить");
          return;
        }
        toast.success("Тест-кейс обновлён");
      } else {
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
            promptTemplate: formPromptTemplate.trim() || null,
            expectedResult,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json.error ?? "Не удалось создать тест-кейс");
          return;
        }
        toast.success("Тест-кейс создан");
      }
      const savedEditingId = editingCaseId;
      setCaseFormOpen(false);
      resetCaseForm();
      await loadCases();
      if (selectedCase && savedEditingId && selectedCase.id === savedEditingId) {
        const list = await fetch("/api/admin/test-cases", { credentials: "include" }).then((r) => r.json());
        const rows = (list.data ?? []) as TestCaseRow[];
        const updated = rows.find((x) => x.id === savedEditingId);
        if (updated) setSelectedCase(updated);
      }
    } finally {
      setCaseFormSaving(false);
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
            <Button size="sm" onClick={() => openCaseFormCreate()} disabled={modules.length === 0}>
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
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => setSelectedCase(c)}>
                            Карточка
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            title="Редактировать"
                            onClick={() => openCaseFormEdit(c)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            title="Копировать"
                            onClick={() => void copyTestCase(c.id)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            disabled={runningId === c.id || !c.enabled || (c.scope === "agent" && !hasAgentExpectedText(c.parameters))}
                            onClick={() => void runTest(c.id)}
                          >
                            <Play className="mr-1 h-3 w-3" />
                            Запустить
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
              {selectedCase.scope === "agent" && !hasAgentExpectedText(selectedCase.parameters) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  ВНИМАНИЕ: в parameters отсутствует `expectedText`. Прогон для scope=agent будет провален.
                  Нажмите «Обогатить спецификацию тест‑кейса с ИИ» — это заполнит required поля.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => openCaseFormEdit(selectedCase)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Редактировать
                </Button>
                <Button variant="outline" onClick={() => void copyTestCase(selectedCase.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Копировать
                </Button>
                <Button
                  variant="outline"
                  disabled={enrichLoading}
                  onClick={() => void enrichSpecification()}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Обогатить спецификацию тест‑кейса с ИИ
                </Button>
                <Button
                  onClick={() => void runTest(selectedCase.id)}
                  disabled={runningId === selectedCase.id || (selectedCase.scope === "agent" && !hasAgentExpectedText(selectedCase.parameters))}
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
                          <TableHead className="text-right">Действия</TableHead>
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
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => void openRunDetail(r.id)}>
                                  Открыть
                                </Button>
                                <Button variant="outline" size="sm" asChild>
                                  <a href={`/admin/test-runs/${r.id}/interactive`} target="_blank" rel="noreferrer">
                                    Посмотреть интерактив
                                  </a>
                                </Button>
                                {(r.status === "running" || r.status === "pending") && (
                                  <Button variant="destructive" size="sm" onClick={() => void stopRun(r.id)}>
                                    Остановить
                                  </Button>
                                )}
                              </div>
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
          <DialogHeader className="space-y-3">
            <DialogTitle>
              Прогон #{runDetail?.runNumber ?? "—"}{" "}
              {runDetail?.testCase ? `(кейс №${runDetail.testCase.number})` : ""}
            </DialogTitle>
            {!runDetailLoading && runDetail && (
              <div className="flex flex-wrap gap-2 border-b pb-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void downloadRunExportJson(runDetail.id)}
                >
                  <Download className="mr-1 h-4 w-4" />
                  Скачать JSON для ИИ
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void sendRunExportWebhook(runDetail.id)}>
                  <Upload className="mr-1 h-4 w-4" />
                  Отправить на вебхук
                </Button>
              </div>
            )}
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
              {(runDetail.status === "running" || runDetail.status === "pending") && (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => void stopRun(runDetail.id)}>
                    Остановить
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/admin/test-runs/${runDetail.id}/interactive`} target="_blank" rel="noreferrer">
                      Посмотреть интерактив
                    </a>
                  </Button>
                </div>
              )}
              <div>
                <h4 className="mb-1 font-medium">Шаги</h4>
                <pre className="max-h-48 overflow-auto rounded-md border p-2 text-xs">
                  {JSON.stringify(runDetail.steps ?? [], null, 2)}
                </pre>
              </div>
              {runDetail.conversationLog != null && (
                <div>
                  <h4 className="mb-1 font-medium">История чата</h4>
                  {normalizeConversationLog(runDetail.conversationLog).length > 0 ? (
                    <div className="max-h-60 overflow-auto rounded-md border p-2 text-xs space-y-2">
                      {normalizeConversationLog(runDetail.conversationLog).map((t, idx) => (
                        <div key={`${idx}-${t.role}`}>
                          <div className="text-[11px] text-muted-foreground">
                            {t.role === "user" ? "Пользователь" : "Модель"}
                          </div>
                          <pre className="whitespace-pre-wrap break-words font-sans text-xs">
                            {t.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-xs">История пуста</div>
                  )}
                </div>
              )}
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

      <Dialog
        open={caseFormOpen}
        onOpenChange={(o) => {
          setCaseFormOpen(o);
          if (!o) resetCaseForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {caseFormMode === "edit" ? "Редактирование тест-кейса" : "Новый тест-кейс"}
            </DialogTitle>
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
            <div>
              <Label htmlFor="tc-prompt-tpl">Шаблон промпта (опционально)</Label>
              <Textarea
                id="tc-prompt-tpl"
                value={formPromptTemplate}
                onChange={(e) => setFormPromptTemplate(e.target.value)}
                rows={3}
                className="text-xs"
                placeholder="Выполни действие: {userPrompt}…"
              />
            </div>
            <div>
              <Label htmlFor="tc-exp-res">Ожидаемый результат (JSON, опционально)</Label>
              <Textarea
                id="tc-exp-res"
                value={formExpectedResultJson}
                onChange={(e) => setFormExpectedResultJson(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder="{}"
              />
            </div>
            {caseFormMode === "edit" && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tc-enabled"
                  className="h-4 w-4 rounded border"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                />
                <Label htmlFor="tc-enabled" className="cursor-pointer font-normal">
                  Кейс включён (участвует в каталоге)
                </Label>
              </div>
            )}
            <Button onClick={() => void submitCaseForm()} disabled={caseFormSaving}>
              {caseFormSaving ? "Сохранение…" : caseFormMode === "edit" ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
