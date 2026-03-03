"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "komiss/components/auth-provider";
import { Button } from "komiss/components/ui/button";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { FolderOpen, File, Download, Trash2, Upload, ArrowLeft } from "lucide-react";

type FileItem = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: string;
};

export default function AdminFilesPage() {
  const router = useRouter();
  const { userRole, loading } = useAuth();
  const [path, setPath] = useState("");
  const [items, setItems] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (userRole !== "admin") {
      router.replace("/");
      return;
    }
  }, [loading, userRole, router]);

  const fetchList = async (p: string) => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files?path=${encodeURIComponent(p)}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      setItems(data.items || []);
      setPath(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (userRole === "admin") fetchList("");
  }, [userRole]);

  const navigate = (item: FileItem) => {
    if (item.isDir) {
      fetchList(item.path);
    }
  };

  const goUp = () => {
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    fetchList(parts.join("/"));
  };

  const handleDownload = async (item: FileItem) => {
    if (item.isDir) return;
    try {
      const res = await fetch(`/api/admin/files/download?path=${encodeURIComponent(item.path)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleDelete = async (item: FileItem) => {
    if (!confirm(`Удалить ${item.isDir ? "папку" : "файл"} «${item.name}»?`)) return;
    try {
      const res = await fetch("/api/admin/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      fetchList(path);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", path);
    try {
      const res = await fetch("/api/admin/files/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      fetchList(path);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
    e.target.value = "";
  };

  const formatSize = (n: number) => {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  };

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
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white px-4 py-2">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/admin" className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Админка
          </Link>
          <h1 className="text-lg font-semibold">Файлы сервера</h1>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <div className="flex items-center gap-2">
              {path && (
                <Button variant="outline" size="sm" onClick={goUp}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Вверх
                </Button>
              )}
              <span className="text-sm text-muted-foreground font-mono">/{path || "."}</span>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleUpload}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1 h-4 w-4" /> Загрузить
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
            {loadingList ? (
              <p className="py-8 text-center text-muted-foreground">Загрузка…</p>
            ) : (
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-zinc-50"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => navigate(item)}
                    >
                      {item.isDir ? (
                        <FolderOpen className="h-5 w-5 shrink-0 text-amber-500" />
                      ) : (
                        <File className="h-5 w-5 shrink-0 text-zinc-400" />
                      )}
                      <span className="truncate font-medium">{item.name}</span>
                      {!item.isDir && <span className="shrink-0 text-xs text-muted-foreground">{formatSize(item.size)}</span>}
                    </button>
                    <div className="flex shrink-0 gap-1">
                      {!item.isDir && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(item)} title="Скачать">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => handleDelete(item)} title="Удалить">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && !error && <p className="py-8 text-center text-muted-foreground">Папка пуста</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
