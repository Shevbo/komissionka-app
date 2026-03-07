"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "komiss/components/ui/button";
import { Input } from "komiss/components/ui/input";
import { Label } from "komiss/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "komiss/components/ui/select";
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
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, Play, Copy, Trash2, ExternalLink, Plus, X } from "lucide-react";

interface Environment {
  id: string;
  name: string;
  port_app: number;
  port_agent: number;
  port_bot: number;
  directory: string;
  db_name: string;
  branch: string;
  status: string;
  is_prod: boolean;
  created_at: string;
  active_operation: string | null;
  version?: { app?: string; agent?: string; tgbot?: string } | null;
}

interface QueueItem {
  id: string;
  environment_id: string;
  environment_name: string | null;
  is_prod: boolean;
  operation: string;
  branch: string | null;
  status: string;
  requested_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface LogEntry {
  id: string;
  environment_name: string | null;
  operation: string;
  status: string;
  output: string | null;
  error: string | null;
  duration_ms: number | null;
  requested_by: string | null;
  source?: string;
  created_at: string;
}

const fetchOpts: RequestInit = { credentials: "include" };

export function DeployTab() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showLogDialog, setShowLogDialog] = useState<LogEntry | null>(null);
  const [newEnv, setNewEnv] = useState({ name: "", port_app: "3001", branch: "main" });
  const [copySettings, setCopySettings] = useState({ source: "", target: "" });

  const fetchData = useCallback(async () => {
    setAccessError(null);
    try {
      const [envRes, queueRes, allLogRes] = await Promise.all([
        fetch("/api/deploy/environments", fetchOpts),
        fetch("/api/deploy/queue?limit=20", fetchOpts),
        fetch("/api/deploy/log?limit=100", fetchOpts),
      ]);

      if (envRes.status === 403 || queueRes.status === 403 || allLogRes.status === 403) {
        setAccessError("Нет доступа к API деплоя. Войдите в админку как администратор.");
      }

      if (envRes.ok) {
        const data = await envRes.json();
        setEnvironments(data.data || []);
      } else if (envRes.status !== 403) {
        const data = await envRes.json().catch(() => ({}));
        toast.error(data.error || "Ошибка загрузки сред");
      }
      if (queueRes.ok) {
        const data = await queueRes.json();
        setQueue(data.data || []);
      }
      if (allLogRes.ok) {
        const data = await allLogRes.json();
        setAllLogs(data.data || []);
      }
      setLastFetch(new Date());
    } catch (err) {
      console.error("Failed to fetch deploy data:", err);
      setAccessError("Ошибка сети при загрузке данных деплоя.");
      toast.error("Не удалось загрузить данные деплоя");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCreateEnv = async () => {
    if (!newEnv.name || !newEnv.port_app) {
      toast.error("Заполните имя и порт");
      return;
    }

    try {
      const res = await fetch("/api/deploy/environments", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEnv.name,
          port_app: parseInt(newEnv.port_app, 10),
          branch: newEnv.branch,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Ошибка создания среды");
        return;
      }

      toast.success(`Среда ${newEnv.name} создается...`);
      setShowCreateDialog(false);
      setNewEnv({ name: "", port_app: "3001", branch: "main" });
      fetchData();
    } catch (err) {
      toast.error("Ошибка создания среды");
    }
  };

  const handleDeploy = async (envId: string, envName: string) => {
    try {
      const res = await fetch("/api/deploy/queue", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment_id: envId,
          operation: "deploy",
          requested_by: "admin-ui",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Ошибка добавления в очередь");
        return;
      }

      toast.success(`Деплой в ${envName} добавлен в очередь`);
      fetchData();
    } catch (err) {
      toast.error("Ошибка добавления в очередь");
    }
  };

  const handleCopy = async () => {
    if (!copySettings.source || !copySettings.target) {
      toast.error("Выберите источник и цель");
      return;
    }

    try {
      const res = await fetch("/api/deploy/copy", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: copySettings.source,
          target: copySettings.target,
          requested_by: "admin-ui",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Ошибка копирования");
        return;
      }

      toast.success(`Копирование ${copySettings.source} → ${copySettings.target} запущено`);
      setShowCopyDialog(false);
      setCopySettings({ source: "", target: "" });
      fetchData();
    } catch (err) {
      toast.error("Ошибка копирования");
    }
  };

  const handleDelete = async (envId: string, envName: string) => {
    if (!confirm(`Удалить среду ${envName}? Это удалит код и базу данных.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/deploy/environments/${envId}`, { ...fetchOpts, method: "DELETE" });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Ошибка удаления");
        return;
      }

      toast.success(`Удаление ${envName} запланировано`);
      fetchData();
    } catch (err) {
      toast.error("Ошибка удаления");
    }
  };

  const handleCancelQueue = async (queueId: string) => {
    try {
      const res = await fetch(`/api/deploy/queue/${queueId}`, { ...fetchOpts, method: "DELETE" });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Ошибка отмены");
        return;
      }

      toast.success("Операция отменена");
      fetchData();
    } catch (err) {
      toast.error("Ошибка отмены");
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      stopped: "bg-gray-100 text-gray-800",
      creating: "bg-blue-100 text-blue-800",
      deleting: "bg-red-100 text-red-800",
      pending: "bg-yellow-100 text-yellow-800",
      running: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    if (dDate.getTime() === today.getTime()) return `сегодня ${time}`;
    if (dDate.getTime() === yesterday.getTime()) return `вчера ${time}`;
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    }).replace(/\s+/g, " ");
  };

  if (loading) {
    return <div className="p-4 text-center">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      {accessError && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {accessError}
        </div>
      )}
      {lastFetch && !accessError && (
        <p className="text-xs text-gray-500">
          Обновлено: {lastFetch.toLocaleTimeString("ru-RU")}. Очередь: {queue.length}, журнал: {allLogs.length} записей.
        </p>
      )}
      {/* Environments Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <h3 className="text-lg font-semibold">Среды</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" /> Обновить
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCopyDialog(true)}>
              <Copy className="w-4 h-4 mr-1" /> Копировать
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Создать
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Версия</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Ветка</TableHead>
                <TableHead>Порт</TableHead>
                <TableHead>БД</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments.map((env) => (
                <TableRow key={env.id}>
                  <TableCell className="font-medium">
                    {env.name}
                    {env.is_prod && <span className="ml-2 text-xs text-orange-600">(prod)</span>}
                  </TableCell>
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                    {env.version?.app != null ? `app ${env.version.app}` : "—"}
                    {env.version?.agent != null ? ` · agent ${env.version.agent}` : ""}
                    {env.version?.tgbot != null ? ` · bot ${env.version.tgbot}` : ""}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(env.status)}
                    {env.active_operation && (
                      <span className="ml-2 text-xs text-blue-600">({env.active_operation})</span>
                    )}
                  </TableCell>
                  <TableCell>{env.branch}</TableCell>
                  <TableCell>{env.port_app}</TableCell>
                  <TableCell className="text-xs text-gray-500">{env.db_name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeploy(env.id, env.name)}
                        disabled={env.status !== "active"}
                        title="Деплой"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`http://83.69.248.175:${env.port_app}`, "_blank")}
                        disabled={env.status !== "active"}
                        title="Открыть"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      {!env.is_prod && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(env.id, env.name)}
                          disabled={env.status === "deleting"}
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {environments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500">
                    Нет сред
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Queue Section */}
      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-lg font-semibold">Очередь операций</h3>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Среда</TableHead>
                <TableHead>Операция</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Ветка</TableHead>
                <TableHead>Создано</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.environment_name}</TableCell>
                  <TableCell>{item.operation}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell>{item.branch || "-"}</TableCell>
                  <TableCell>{formatDate(item.created_at)}</TableCell>
                  <TableCell>
                    {item.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelQueue(item.id)}
                        title="Отменить"
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {queue.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500">
                    Очередь пуста
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* All operations log — queue + script runs (no gaps) */}
      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-lg font-semibold">Журнал всех операций</h3>
          <p className="text-xs text-muted-foreground font-normal mt-1">
            Все операции worker: по очереди (админка, Cursor, агент ИИ) и прямые запуски скриптов (deploy-from-git.sh, env-deploy.sh). Без исключений и пропусков. Последние 100 записей.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Среда</TableHead>
                <TableHead>Операция</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Источник</TableHead>
                <TableHead>Кто запросил</TableHead>
                <TableHead>Длительность</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(log.created_at)}</TableCell>
                  <TableCell>{log.environment_name ?? "—"}</TableCell>
                  <TableCell>{log.operation}</TableCell>
                  <TableCell>{getStatusBadge(log.status)}</TableCell>
                  <TableCell>
                    <span className={log.source === "script" ? "text-amber-600 dark:text-amber-400" : ""}>
                      {log.source === "script" ? "скрипт" : "очередь"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400 max-w-[120px] truncate" title={log.requested_by ?? ""}>
                    {log.requested_by ?? "—"}
                  </TableCell>
                  <TableCell>
                    {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowLogDialog(log)}
                      title="Подробнее"
                    >
                      Лог
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {allLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500">
                    Нет записей
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Environment Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать среду</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Имя среды</Label>
              <Input
                value={newEnv.name}
                onChange={(e) => setNewEnv({ ...newEnv, name: e.target.value })}
                placeholder="test1"
              />
              <p className="text-xs text-gray-500 mt-1">Только a-z, 0-9, _, -</p>
            </div>
            <div>
              <Label>Порт приложения</Label>
              <Input
                type="number"
                value={newEnv.port_app}
                onChange={(e) => setNewEnv({ ...newEnv, port_app: e.target.value })}
                placeholder="3001"
              />
              <p className="text-xs text-gray-500 mt-1">Agent = port+100, Bot = port+200</p>
            </div>
            <div>
              <Label>Ветка</Label>
              <Input
                value={newEnv.branch}
                onChange={(e) => setNewEnv({ ...newEnv, branch: e.target.value })}
                placeholder="main"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleCreateEnv}>Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy Environment Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Копировать среду</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Источник</Label>
              <Select
                value={copySettings.source}
                onValueChange={(v) => setCopySettings({ ...copySettings, source: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите источник" />
                </SelectTrigger>
                <SelectContent>
                  {environments
                    .filter((e) => e.status === "active")
                    .map((env) => (
                      <SelectItem key={env.id} value={env.name}>
                        {env.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Цель</Label>
              <Select
                value={copySettings.target}
                onValueChange={(v) => setCopySettings({ ...copySettings, target: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите цель" />
                </SelectTrigger>
                <SelectContent>
                  {environments
                    .filter((e) => e.name !== copySettings.source)
                    .map((env) => (
                      <SelectItem key={env.id} value={env.name}>
                        {env.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-gray-500">
              Копируется код и база данных. Целевая среда будет перезаписана.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCopyDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleCopy}>Копировать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log Details Dialog */}
      <Dialog open={!!showLogDialog} onOpenChange={() => setShowLogDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {showLogDialog?.operation} - {showLogDialog?.environment_name}
            </DialogTitle>
          </DialogHeader>
          {showLogDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Статус:</span>{" "}
                  {getStatusBadge(showLogDialog.status)}
                </div>
                <div>
                  <span className="text-gray-500">Длительность:</span>{" "}
                  {showLogDialog.duration_ms
                    ? `${(showLogDialog.duration_ms / 1000).toFixed(1)}s`
                    : "-"}
                </div>
                <div>
                  <span className="text-gray-500">Запросил:</span>{" "}
                  {showLogDialog.requested_by || "-"}
                </div>
                <div>
                  <span className="text-gray-500">Время:</span>{" "}
                  {new Date(showLogDialog.created_at).toLocaleString("ru-RU")}
                </div>
              </div>
              {showLogDialog.output && (
                <div>
                  <Label>Вывод</Label>
                  <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-60">
                    {showLogDialog.output}
                  </pre>
                </div>
              )}
              {showLogDialog.error && (
                <div>
                  <Label className="text-red-600">Ошибка</Label>
                  <pre className="mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs overflow-auto max-h-40 text-red-700">
                    {showLogDialog.error}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
