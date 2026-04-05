"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "komiss/components/auth-provider";
import { useActivity } from "komiss/components/ActivityProvider";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { Input } from "komiss/components/ui/input";
import { Textarea } from "komiss/components/ui/textarea";
import { Button } from "komiss/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "komiss/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "komiss/components/ui/dialog";
import { Label } from "komiss/components/ui/label";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "komiss/lib/utils";
import { isImageCapableModel } from "komiss/lib/agent-models";
import { getModeButtonLabel } from "komiss/lib/agent-mode-labels";
import { AdminItemsTable } from "komiss/components/admin-items-table";
import { ActivityOperationsDialog } from "komiss/components/ActivityOperationsDialog";
import { AgentCacheBrowser } from "komiss/components/AgentCacheBrowser";
import { DeployTab } from "komiss/components/DeployTab";
import { AdminTestCatalogTab } from "komiss/components/AdminTestCatalogTab";
import { WysiwygEditor } from "komiss/components/WysiwygEditor";
import { Pencil, Trash2 } from "lucide-react";

type Item = {
  id: string;
  title: string | null;
  price: number | null;
  status: string | null;
  created_at: string;
};

type Message = {
  id: string;
  item_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  last_active_at: string | null;
  telegram_id?: string | null;
  telegram_username?: string | null;
};

type SiteSettings = {
  key: string;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  h_banner: number | null;
  news_banner_height: number | null;
  news_scroll_speed: number | null;
  catalog_min_columns?: number | null;
  catalog_max_card_width?: number | null;
  catalog_gap_px?: number | null;
  catalog_card_padding_px?: number | null;
  catalog_title_font_px?: number | null;
  catalog_text_font_px?: number | null;
  agent_llm_model?: string | null;
  agent_mode?: string | null;
};

type NewsItem = {
  id: string;
  title: string | null;
  body: string | null;
  created_at: string;
};

type Testimonial = {
  id: string;
  author_name: string | null;
  text: string | null;
  is_active: boolean;
  created_at: string;
  rating?: number | null;
};

type BacklogItem = {
  id: string;
  order_num: number | null;
  sprint_number: number;
  sprint_status: string;
  short_description: string;
  description_prompt: string;
  task_status: string;
  task_type?: string | null;
  modules?: string | null;
  components?: string | null;
  complexity?: number | null;
  prompt_model?: string | null;
  prompt_created_at?: string | null;
  prompt_duration_sec?: number | null;
  prompt_log_id?: string | null;
  prompt_about?: string | null;
  doc_link: string | null;
  test_order_or_link: string | null;
  created_at: string | null;
  status_changed_at: string | null;
};

const BACKLOG_SPRINT_STATUSES = ["формируется", "выполняется", "реализован", "архив"] as const;
const BACKLOG_TASK_STATUSES = ["не начато", "выполняется", "тестируется", "сделано", "отказ"] as const;

/** Убирает устаревший текст про «4 цифры» / «Подтвердите кодом» (если агент на проде ещё старый). */
function normalizeAgentResultForDisplay(result: string): string {
  if (!result || (!result.includes("Подтвердите кодом") && !result.includes("4 цифр"))) return result;
  const out = result
    .replace(/\n*Подтвердите кодом:\s*\d{4}\s*\n*/gi, "\n\n")
    .replace(/\n*\(Повторите 4 цифры[^)]*\)\.?\s*\n*/gi, "\n\n")
    .replace(/\n*Повторите 4 цифры ответным сообщением[^.\n]*\.?\s*\n*/gi, "\n\n");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export default function AdminPage() {
  const router = useRouter();
  const { user: currentUser, userRole, loading: authLoading, profile, refreshProfile } = useAuth();
  const { trackAction } = useActivity();
  const [items, setItems] = useState<Item[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [itemsCount, setItemsCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [usersSearch, setUsersSearch] = useState("");
  const [cartItemsByUser, setCartItemsByUser] = useState<Record<string, string[]>>({});
  const [cartDialog, setCartDialog] = useState<{ open: boolean; titles: string[] }>({ open: false, titles: [] });
  const [activityCountByUser, setActivityCountByUser] = useState<Record<string, number>>({});
  const [activityByUser, setActivityByUser] = useState<Record<string, { action_type: string; created_at: string; details: Record<string, unknown> | null }[]>>({});
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; actions: { action_type: string; created_at: string; details: Record<string, unknown> | null }[] }>({ open: false, actions: [] });
  const [allActivityRows, setAllActivityRows] = useState<{ user_id: string; action_type: string; created_at: string; details: Record<string, unknown> | null }[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  // CMS state
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  // Content form
  const [contentForm, setContentForm] = useState({
    hero_title: "",
    hero_subtitle: "",
    hero_image_url: "",
    h_banner: 200,
    news_banner_height: 200,
    news_scroll_speed: 3,
    catalog_min_columns: 2,
    catalog_max_card_width: 360,
    catalog_gap_px: 24,
    catalog_card_padding_px: 24,
    catalog_title_font_px: 18,
    catalog_text_font_px: 14,
  });
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroPreviewKey, setHeroPreviewKey] = useState(0);
  const [contentSaving, setContentSaving] = useState(false);

  // Telegram bind (4.1: привязка админа к Telegram)
  const [telegramBindCode, setTelegramBindCode] = useState<string | null>(null);
  const [telegramBindLoading, setTelegramBindLoading] = useState(false);

  // News form
  const [newsForm, setNewsForm] = useState({ title: "", body: "" });
  const [newsSaving, setNewsSaving] = useState(false);

  // Testimonial form
  const [testimonialForm, setTestimonialForm] = useState({ author_name: "", text: "" });
  const [testimonialSaving, setTestimonialSaving] = useState(false);

  // Backlog
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [backlogForm, setBacklogForm] = useState({
    order_num: "" as string | number,
    sprint_number: 1,
    sprint_status: "формируется",
    short_description: "",
    description_prompt: "",
    task_status: "не начато",
    doc_link: "",
    test_order_or_link: "",
    prompt_about: "",
  });
  const [backlogEditId, setBacklogEditId] = useState<string | null>(null);
  const [backlogEditForm, setBacklogEditForm] = useState<Partial<BacklogItem>>({});
  const [backlogSaving, setBacklogSaving] = useState(false);
  const [backlogPromptModelNew, setBacklogPromptModelNew] = useState<string | null>(null);
  const [backlogPromptModelEdit, setBacklogPromptModelEdit] = useState<string | null>(null);
  const [backlogPromptScopeNew, setBacklogPromptScopeNew] = useState<"brief" | "standard" | "full">("standard");
  const [backlogPromptScopeEdit, setBacklogPromptScopeEdit] = useState<"brief" | "standard" | "full">("standard");
  const [promptAboutExpandedNew, setPromptAboutExpandedNew] = useState(false);
  const [promptAboutExpandedEdit, setPromptAboutExpandedEdit] = useState(false);
  const [backlogPage, setBacklogPage] = useState(1);
  const [backlogTotal, setBacklogTotal] = useState(0);
  const [backlogSort, setBacklogSort] = useState<"order_num" | "short_description" | "created_at" | "task_status">("order_num");
  const [backlogOrder, setBacklogOrder] = useState<"asc" | "desc">("asc");
  const [backlogFilterStatus, setBacklogFilterStatus] = useState<string>("__all__");
  const [backlogFilterType, setBacklogFilterType] = useState<string>("__all__");

  // Комиссионка AI chat: сессии в IndexedDB (до 4ГБ) или localStorage, до ручного удаления
  type ChatMessageRow = { role: "user" | "assistant"; content: string; timestamp?: number };
  type AiChatSession = { id: string; title: string; messages: ChatMessageRow[]; createdAt: number; mode: AiMode };
  const AI_MODE_STORAGE_KEY = "komiss_ai_mode";

  const [aiSessions, setAiSessions] = useState<AiChatSession[]>([]);
  const [activeAiSessionId, setActiveAiSessionId] = useState<string | null>(null);
  const [aiChatsLoaded, setAiChatsLoaded] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInputImageDataUrl, setAiInputImageDataUrl] = useState<string | null>(null);
  const [aiLastSteps, setAiLastSteps] = useState<Array<{
    type: string;
    text: string;
    detail?: string;
    requestSummary?: string;
    toolName?: string;
    toolArgs?: string;
    toolResultSummary?: string;
    success?: boolean;
  }>>([]);
  const [aiLastLogId, setAiLastLogId] = useState<string | null>(null);
  const [statusDumping, setStatusDumping] = useState(false);
  const [statusDumpResult, setStatusDumpResult] = useState<string | null>(null);
  type AiMode = "chat" | "consult" | "dev";
  const [aiMode, setAiMode] = useState<AiMode>(() => {
    if (typeof window === "undefined") return "consult";
    try {
      const saved = localStorage.getItem(AI_MODE_STORAGE_KEY);
      if (saved === "chat" || saved === "consult" || saved === "dev") return saved;
    } catch {
      // ignore
    }
    return "consult";
  });

  /** Сохраняем выбранный режим при смене (чтобы не сбрасывался на «chat» при обновлении страницы). */
  useEffect(() => {
    try {
      localStorage.setItem(AI_MODE_STORAGE_KEY, aiMode);
    } catch {
      // ignore
    }
  }, [aiMode]);
  const [agentModels, setAgentModels] = useState<Array<{ id: string; name: string; provider: string; description?: string; typeIcon?: string }>>([]);
  const [selectedAgentModel, setSelectedAgentModel] = useState<string | null>(null);
  const [agentModelSaving, setAgentModelSaving] = useState(false);
  const [hasOpenRouterKey, setHasOpenRouterKey] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [adminTopMenuOpen, setAdminTopMenuOpen] = useState(false);

  /** Активная вкладка админки (для прокрутки чата при открытии «Комиссионка AI»). */
  const [adminTab, setAdminTabState] = useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      const validTabs = [
        "items",
        "users",
        "content",
        "news",
        "testimonials",
        "backlog",
        "ai",
        "tests",
        "cache",
        "deploy",
      ];
      if (validTabs.includes(hash)) return hash;
    }
    return "items";
  });
  const setAdminTab = useCallback((tab: string) => {
    setAdminTabState(tab);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${tab}`);
    }
  }, []);

  const activeAiSession = useMemo(
    () => aiSessions.find((s) => s.id === activeAiSessionId && s.mode === aiMode) ?? null,
    [aiSessions, activeAiSessionId, aiMode]
  );
  const aiMessages = activeAiSession?.messages ?? [];

  // Фокус на низ переписки: прокручиваем именно контейнер чата (не окно) и повторяем после раскладки вкладки
  const scrollChatToBottom = useCallback(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (adminTab !== "ai") return;
    scrollChatToBottom();
    const t1 = setTimeout(scrollChatToBottom, 50);
    const t2 = setTimeout(scrollChatToBottom, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [adminTab, aiMessages.length, aiLoading, activeAiSessionId, scrollChatToBottom]);

  useEffect(() => {
    let cancelled = false;
    import("komiss/lib/ai-chats-storage").then(({ loadAiChats }) => {
      loadAiChats(aiMode).then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.sessions) && data.sessions.length > 0) {
          // Нормализация: сессии уже содержат mode (ai-chats-storage нормализует),
          // но на всякий случай задаём consult по умолчанию.
          const normalized = data.sessions.map((s) => ({
            ...s,
            mode: s.mode === "chat" || s.mode === "consult" || s.mode === "dev" ? s.mode : "consult",
          })) as AiChatSession[];
          setAiSessions(normalized);
          const firstForMode =
            (data.activeId && normalized.find((s) => s.id === data.activeId && s.mode === aiMode)) ||
            normalized.find((s) => s.mode === aiMode) ||
            normalized[0];
          setActiveAiSessionId(firstForMode?.id ?? data.activeId ?? null);
        } else {
          const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          setAiSessions([{ id, title: "Новый чат", messages: [], createdAt: Date.now(), mode: aiMode }]);
          setActiveAiSessionId(id);
        }
        setAiChatsLoaded(true);
      }).catch(() => {
        if (cancelled) return;
        const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        setAiSessions([{ id, title: "Новый чат", messages: [], createdAt: Date.now(), mode: aiMode }]);
        setActiveAiSessionId(id);
        setAiChatsLoaded(true);
      });
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount with initial aiMode
  }, []);

  // При смене режима используем отдельные чаты:
  // если для режима уже есть сессия — активируем её; иначе создаём новую.
  useEffect(() => {
    if (!aiChatsLoaded) return;
    const current = aiSessions.find((s) => s.id === activeAiSessionId && s.mode === aiMode);
    if (current) return;
    const firstForMode = aiSessions.find((s) => s.mode === aiMode);
    if (firstForMode) {
      setActiveAiSessionId(firstForMode.id);
      return;
    }
    const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const session: AiChatSession = { id, title: "Новый чат", messages: [], createdAt: Date.now(), mode: aiMode };
    setAiSessions((prev) => [session, ...prev]);
    setActiveAiSessionId(id);
  }, [aiMode, aiChatsLoaded, aiSessions, activeAiSessionId]);

  const persistAiChats = useCallback(() => {
    import("komiss/lib/ai-chats-storage").then(({ saveAiChats }) => {
      saveAiChats({ sessions: aiSessions, activeId: activeAiSessionId });
    });
  }, [aiSessions, activeAiSessionId]);

  useEffect(() => {
    if (!aiChatsLoaded) return;
    const t = setTimeout(persistAiChats, 300);
    return () => clearTimeout(t);
  }, [aiSessions, activeAiSessionId, persistAiChats, aiChatsLoaded]);

  useEffect(() => {
    const onBeforeUnload = () => {
      import("komiss/lib/ai-chats-storage").then(({ saveAiChats }) => {
        saveAiChats({ sessions: aiSessions, activeId: activeAiSessionId });
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [aiSessions, activeAiSessionId]);

  const createNewAiChat = useCallback(() => {
    const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const session: AiChatSession = { id, title: "Новый чат", messages: [], createdAt: Date.now(), mode: aiMode };
    setAiSessions((prev) => [session, ...prev]);
    setActiveAiSessionId(id);
  }, [aiMode]);

  const clearCurrentAiChat = useCallback(() => {
    if (!activeAiSessionId) return;
    setAiSessions((prev) =>
      prev.map((s) =>
        s.id === activeAiSessionId ? { ...s, messages: [], title: "Новый чат" } : s
      )
    );
  }, [activeAiSessionId]);

  const deleteAiChat = useCallback((id: string) => {
    setAiSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeAiSessionId === id) {
        setActiveAiSessionId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [activeAiSessionId]);

  const setAiMessagesForCurrentSession = useCallback(
    (updater: (prev: ChatMessageRow[]) => ChatMessageRow[]) => {
      if (!activeAiSessionId) return;
      setAiSessions((prev) =>
        prev.map((s) =>
          s.id === activeAiSessionId ? { ...s, messages: updater(s.messages) } : s
        )
      );
    },
    [activeAiSessionId]
  );

  /** После ошибки агента запрашивает /api/admin/agent/diagnose, но в чат кладёт только короткую подсказку — без технического лога. */
  const appendAgentDiagnoseToChat = useCallback(() => {
    fetch("/api/admin/agent/diagnose", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { ok?: boolean }) => {
        if (data.ok) {
          setAiMessagesForCurrentSession((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "Агент вернул ошибку при выполнении запроса.\n\nДля диагностики просто нажмите кнопку «ДАМП СОСТОЯНИЯ» слева и пришлите путь к созданному файлу в этот чат — я по нему восстановлю всю техническую картину.",
              timestamp: Date.now(),
            },
          ]);
        }
      })
      .catch(() => {});
  }, [setAiMessagesForCurrentSession]);

  const updateActiveSessionTitle = useCallback(
    (firstUserMessage: string) => {
      if (!activeAiSessionId) return;
      const title = firstUserMessage.slice(0, 48).trim() || "Новый чат";
      setAiSessions((prev) =>
        prev.map((s) => (s.id === activeAiSessionId && s.title === "Новый чат" ? { ...s, title } : s))
      );
    },
    [activeAiSessionId]
  );

  const fetchAdminData = useCallback(async () => {
    setDataError(null);
    const res = await fetch("/api/admin/data", { credentials: "include" });
    if (!res.ok) {
      const msg = res.status === 403
        ? "Нет доступа. Войдите под учётной записью администратора."
        : res.statusText || "Ошибка загрузки";
      setDataError(msg);
      throw new Error(msg);
    }
    const data = await res.json();
    setItemsCount(data.itemsCount ?? 0);
    setMessagesCount(data.messagesCount ?? 0);
    setItems(data.items ?? []);
    setMessages(data.messages ?? []);
    setProfiles(data.profiles ?? []);
    setCartItemsByUser(data.cartItemsByUser ?? {});
    setActivityCountByUser(data.activityCountByUser ?? {});
    setActivityByUser(data.activityByUser ?? {});
    setAllActivityRows(data.allActivityRows ?? []);
    setSiteSettings(data.siteSettings ?? null);
    if (data.siteSettings) {
      setContentForm({
        hero_title: data.siteSettings.hero_title ?? "",
        hero_subtitle: data.siteSettings.hero_subtitle ?? "",
        hero_image_url: data.siteSettings.hero_image_url ?? "",
        h_banner: data.siteSettings.h_banner ?? 200,
        news_banner_height: data.siteSettings.news_banner_height ?? 200,
        news_scroll_speed: data.siteSettings.news_scroll_speed ?? 3,
        catalog_min_columns: data.siteSettings.catalog_min_columns ?? 2,
        catalog_max_card_width: data.siteSettings.catalog_max_card_width ?? 360,
        catalog_gap_px: data.siteSettings.catalog_gap_px ?? 24,
        catalog_card_padding_px: data.siteSettings.catalog_card_padding_px ?? 24,
        catalog_title_font_px: data.siteSettings.catalog_title_font_px ?? 18,
        catalog_text_font_px: data.siteSettings.catalog_text_font_px ?? 14,
      });
    }
    setNews(data.news ?? []);
    setTestimonials(data.testimonials ?? []);
    setBacklog(data.backlog ?? []);
    setBacklogTotal(data.backlog?.length ?? 0);
  }, []);

  const fetchBacklog = useCallback(
    async (page?: number) => {
      const p = page ?? backlogPage;
      const params = new URLSearchParams({
        _page: String(p),
        _limit: "100",
        _sort: backlogSort,
        _order: backlogOrder,
      });
      if (backlogFilterStatus && backlogFilterStatus !== "__all__") params.set("task_status", backlogFilterStatus);
      if (backlogFilterType && backlogFilterType !== "__all__") params.set("task_type", backlogFilterType);
      const res = await fetch(`/api/admin/backlog?${params}`, { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      setBacklog(json.data ?? []);
      setBacklogTotal(json.total ?? 0);
      if (page !== undefined) setBacklogPage(page);
    },
    [backlogPage, backlogSort, backlogOrder, backlogFilterStatus, backlogFilterType]
  );

  useEffect(() => {
    if (authLoading) return;
    if (userRole !== "admin") {
      router.replace("/");
      return;
    }
  }, [authLoading, userRole, router]);

  useEffect(() => {
    if (userRole !== "admin") return;
    fetch("/api/admin/agent/model")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.models) setAgentModels(d.models);
        if (d?.selected != null) setSelectedAgentModel(d.selected);
        if (d?.hasOpenRouterKey != null) setHasOpenRouterKey(d.hasOpenRouterKey);
      })
      .catch(() => {});
  }, [userRole]);
  useEffect(() => {
    if (siteSettings?.agent_llm_model != null && selectedAgentModel === null) {
      setSelectedAgentModel(siteSettings.agent_llm_model || null);
    }
  }, [siteSettings?.agent_llm_model, selectedAgentModel]);

  useEffect(() => {
    if (userRole !== "admin") return;
    setDataLoading(true);
    fetchAdminData()
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, [userRole, fetchAdminData]);

  const filteredProfiles = useMemo(() => {
    const q = usersSearch.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.full_name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q)
    );
  }, [profiles, usersSearch]);

  async function handleRoleChange(profileId: string, newRole: "user" | "admin") {
    if (profileId === currentUser?.id && newRole === "user") {
      alert("Вы не можете снять роль администратора с самого себя.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/profiles/${profileId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p)));
      trackAction("role_change", profileId);
    } catch (err) {
      console.error("Ошибка смены роли:", err);
      alert("Не удалось изменить роль.");
    }
  }

  const ACTION_LABELS: Record<string, string> = {
    product_click: "Просмотр",
    add_to_cart: "В корзину",
    REMOVE_FROM_CART: "Удаление из корзины",
    SEARCH: "Поиск",
    LOGIN: "Вход",
    REGISTER: "Регистрация",
    LOGOUT: "Выход",
    DISCONNECT: "Закрытие вкладки",
    settings_save: "Сохранение настроек",
    content_save: "Сохранение контента",
    news_save: "Создание новости",
    testimonial_save: "Создание отзыва",
    role_change: "Смена роли",
  };

  function formatDateTimeExport(iso: string): string {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yy} ${hh}:${min}`;
  }

  function escapeCsvCell(s: string): string {
    if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  async function handleExportActivity() {
    setExportLoading(true);
    try {
      const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name ?? p.email ?? "—"]));
      const entityIds = [
        ...new Set(
          allActivityRows.flatMap((r) => {
            const d = r.details as Record<string, string> | null;
            const id = d?.entity_id ?? d?.product_id;
            return id ? [id] : [];
          })
        ),
      ];
      let itemsMap: Record<string, { title: string | null; price: number | null; author_name: string | null }> = {};
      if (entityIds.length > 0) {
        const res = await fetch(`/api/items?ids=${entityIds.join(",")}`);
        const data = await res.json();
        for (const row of data.items ?? []) {
          itemsMap[row.id] = {
            title: row.title,
            price: row.price,
            author_name: row.author_name ?? null,
          };
        }
      }
      const header = ["Дата", "Действие", "Пользователь", "Товар", "Цена", "Продавец товара"];
      const rows = allActivityRows.map((r) => {
        const d = r.details as Record<string, string> | null;
        const entityId = d?.entity_id ?? d?.product_id;
        const item = entityId ? itemsMap[entityId] : null;
        const productTitle = item?.title ?? (d?.query ? `«${d.query}»` : "");
        const price = item?.price != null ? String(item.price) : "";
        const seller = item?.author_name ?? "";
        const userDisplay = r.user_id
          ? (profileMap[r.user_id] ?? r.user_id)
          : (d?.session_id ? `Анонимный пользователь - ${d.session_id}` : "Анонимный пользователь");
        return [
          formatDateTimeExport(r.created_at ?? ""),
          ACTION_LABELS[r.action_type] ?? r.action_type,
          userDisplay,
          productTitle,
          price,
          seller,
        ].map(escapeCsvCell);
      });
      const csv = [header.join(";"), ...rows.map((row) => row.join(";"))].join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Экспорт выполнен");
    } catch (err) {
      console.error("Ошибка экспорта:", err);
      toast.error("Не удалось выполнить экспорт");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleDeleteItem(id: string) {
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error);
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      setItemsCount((c) => Math.max(0, c - 1));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      alert(msg);
    }
  }

  async function handleSaveContent() {
    setContentSaving(true);
    const hero_title = contentForm.hero_title || "";
    const hero_subtitle = contentForm.hero_subtitle || "";
    const h_banner = contentForm.h_banner > 0 ? contentForm.h_banner : 200;
    const news_banner_height = contentForm.news_banner_height > 0 ? contentForm.news_banner_height : 200;
    const news_scroll_speed = contentForm.news_scroll_speed >= 0 ? contentForm.news_scroll_speed : 3;
    const catalog_min_columns =
      typeof contentForm.catalog_min_columns === "number"
        ? Math.min(Math.max(contentForm.catalog_min_columns, 1), 4)
        : 2;
    const catalog_max_card_width =
      typeof contentForm.catalog_max_card_width === "number"
        ? Math.max(200, Math.min(contentForm.catalog_max_card_width, 600))
        : 360;
    const catalog_gap_px =
      typeof contentForm.catalog_gap_px === "number"
        ? Math.max(8, Math.min(contentForm.catalog_gap_px, 64))
        : 24;
    const catalog_card_padding_px =
      typeof contentForm.catalog_card_padding_px === "number"
        ? Math.max(8, Math.min(contentForm.catalog_card_padding_px, 48))
        : 24;
    const catalog_title_font_px =
      typeof contentForm.catalog_title_font_px === "number"
        ? Math.max(12, Math.min(contentForm.catalog_title_font_px, 28))
        : 18;
    const catalog_text_font_px =
      typeof contentForm.catalog_text_font_px === "number"
        ? Math.max(10, Math.min(contentForm.catalog_text_font_px, 24))
        : 14;

    try {
      let hero_image_url = contentForm.hero_image_url;
      if (heroImageFile) {
        const formData = new FormData();
        formData.append("file", heroImageFile);
        const uploadRes = await fetch("/api/upload/hero", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          let msg = "Ошибка загрузки изображения";
          try {
            const j = (await uploadRes.json()) as { error?: string };
            if (j?.error) msg = j.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const uploadData = await uploadRes.json();
        hero_image_url = uploadData.url ?? hero_image_url;
        setHeroImageFile(null);
        setHeroPreviewKey(Date.now());
      }

      const res = await fetch("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hero_title,
          hero_subtitle,
          h_banner,
          hero_image_url: hero_image_url || undefined,
          news_banner_height,
          news_scroll_speed,
          catalog_min_columns,
          catalog_max_card_width,
          catalog_gap_px,
          catalog_card_padding_px,
          catalog_title_font_px,
          catalog_text_font_px,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setContentForm((f) => ({ ...f, hero_image_url: hero_image_url ?? "" }));
      router.refresh();
      toast.success("Данные обновлены!");
      trackAction("settings_save");
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      toast.error(errStr || "Не удалось сохранить контент");
    } finally {
      setContentSaving(false);
    }
  }

  async function handleCreateNews() {
    if (!newsForm.title.trim()) {
      alert("Введите заголовок");
      return;
    }
    setNewsSaving(true);
    try {
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newsForm.title.trim(), body: newsForm.body || "" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewsForm({ title: "", body: "" });
      await fetchAdminData();
      trackAction("news_save");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Не удалось создать новость");
    } finally {
      setNewsSaving(false);
    }
  }

  async function handleDeleteNews(id: string) {
    if (!window.confirm("Удалить новость?")) return;
    try {
      const res = await fetch(`/api/admin/news/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setNews((prev) => prev.filter((n) => n.id !== id));
    } catch {
      alert("Не удалось удалить");
    }
  }

  async function handleToggleTestimonial(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error();
      setTestimonials((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: isActive } : t)));
    } catch {
      alert("Не удалось обновить отзыв");
    }
  }

  async function handleCreateTestimonial() {
    if (!testimonialForm.author_name.trim() || !testimonialForm.text.trim()) {
      toast.error("Введите имя автора и текст отзыва");
      return;
    }
    setTestimonialSaving(true);
    try {
      const res = await fetch("/api/admin/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_name: testimonialForm.author_name.trim(),
          text: testimonialForm.text.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setTestimonialForm({ author_name: "", text: "" });
      await fetchAdminData();
      trackAction("testimonial_save");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать отзыв");
    } finally {
      setTestimonialSaving(false);
    }
  }

  async function handleDeleteTestimonial(id: string) {
    if (!window.confirm("Удалить отзыв?")) return;
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTestimonials((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert("Не удалось удалить");
    }
  }

  async function handleCreateBacklog() {
    if (!backlogForm.short_description.trim()) {
      toast.error("Введите краткое описание");
      return;
    }
    setBacklogSaving(true);
    try {
      const res = await fetch("/api/admin/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_num: backlogForm.order_num === "" ? null : Number(backlogForm.order_num),
          sprint_number: backlogForm.sprint_number,
          sprint_status: backlogForm.sprint_status,
          short_description: backlogForm.short_description.trim(),
          description_prompt: backlogForm.description_prompt,
          task_status: backlogForm.task_status,
          doc_link: backlogForm.doc_link.trim() || null,
          test_order_or_link: backlogForm.test_order_or_link.trim() || null,
          prompt_about: backlogForm.prompt_about?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setBacklogForm({
        order_num: "",
        sprint_number: 1,
        sprint_status: "формируется",
        short_description: "",
        description_prompt: "",
        task_status: "не начато",
        doc_link: "",
        test_order_or_link: "",
        prompt_about: "",
      });
      await fetchAdminData();
      await fetchBacklog(backlogPage);
      toast.success("Запись бэклога создана");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать");
    } finally {
      setBacklogSaving(false);
    }
  }

  async function handleGenerateBacklogPromptNew() {
    if (!backlogForm.short_description.trim()) {
      toast.error("Сначала введите краткое описание");
      return;
    }
    setBacklogSaving(true);
    try {
      const shortDesc = backlogForm.short_description.trim();
      const scopeInstruction =
        backlogPromptScopeNew === "brief"
          ? "Объём промпта: КРАТКО — только суть задачи, минимум текста."
          : backlogPromptScopeNew === "full"
            ? "Объём промпта: ПОЛНАЯ ДЕТАЛИЗАЦИЯ — максимально развёрнутый технический промпт."
            : "Объём промпта: СТАНДАРТ — развёрнутый технический промпт с заголовками и списками.";
      const metaPromptLines = [
        "Ты — ведущий разработчик и архитектор проекта «Комиссионка» (Next.js, TypeScript, Prisma 7, PostgreSQL, NextAuth, Telegram-бот, отдельный агент к модели ИИ).",
        "",
        "КРАТКОЕ ОПИСАНИЕ ЗАДАЧИ (short_description):",
        `«${shortDesc}»`,
        "",
        "Текущее описание/промпт (черновик):",
        backlogForm.description_prompt ? backlogForm.description_prompt : "(пока пусто).",
        "",
        scopeInstruction,
        "",
        "Твоя задача:",
        "1) Сформировать технический промпт только про саму задачу (без инструкций по тестированию — тестирование в отдельном поле тикета «Тестирование / ссылка на сценарии»).",
        "2) Присвоить классификаторы: task_type, modules, components, complexity.",
        "",
        "Требования к prompt_markdown: только про задачу; Markdown с заголовками и списками; без раздела «как тестировать».",
        "",
        "Формат ОТВЕТА (ОБЯЗАТЕЛЬНО, БЕЗ ДОПОЛНИТЕЛЬНОГО ТЕКСТА ВНЕ JSON):",
        "{",
        '  "task_type": "feature" | "bug" | "data_change",',
        '  "modules": ["app", "agent"],',
        '  "components": ["frontend", "api"],',
        '  "complexity": 1 | 2 | 3 | 4 | 5,',
        '  "prompt_markdown": "Здесь полный Markdown-промпт для разработчика по описанной задаче."',
        "}",
      ];
      const metaPrompt = metaPromptLines.join("\n");
      const res = await fetch("/api/admin/agent/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: metaPrompt,
          history: [],
          mode: "dev",
          project: "Комиссионка backlog",
          chatName: `backlog:new:${Date.now()}`,
          environment: "admin",
          disableCache: true,
          ...(backlogPromptModelNew ? { model: backlogPromptModelNew } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data) {
        throw new Error(data.error || `Agent error: HTTP ${res.status}`);
      }
      const rawResult: string = typeof data.result === "string" ? data.result : "";
      const jsonMatch =
        /```json\s*([\s\S]*?)```/i.exec(rawResult) ?? /(\{[\s\S]*\})/.exec(rawResult);
      if (!jsonMatch) {
        throw new Error("Модель не вернула JSON-блок с prompt_markdown.");
      }
      let parsed: {
        prompt_markdown?: string;
        task_type?: string;
        modules?: string[] | null;
        components?: string[] | null;
        complexity?: number | null;
      };
      try {
        parsed = JSON.parse(jsonMatch[1] as string);
      } catch (e) {
        throw new Error(
          `Не удалось распарсить JSON из ответа модели: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
      if (!parsed.prompt_markdown || typeof parsed.prompt_markdown !== "string") {
        throw new Error("В JSON нет поля prompt_markdown.");
      }
      const promptAboutLines: string[] = [];
      const short = (backlogForm.short_description ?? "").trim() || "—";
      const desc = (backlogForm.description_prompt ?? "").trim();
      const originalPhrase = desc ? `${short}. ${desc}` : short;
      promptAboutLines.push(`Исходно задача звучала так: ${originalPhrase}`);
      const symMatch = /Символов:\s*ввод\s*(\d+)\s*\/\s*вывод\s*(\d+)\s*\(слов:\s*(\d+)\s*\/\s*(\d+)\)/.exec(rawResult);
      if (symMatch) {
        promptAboutLines.push(
          `Символов было в обмене с моделью ИИ: ввод ${symMatch[1]} / вывод ${symMatch[2]} (слов: ${symMatch[3]} / ${symMatch[4]})`
        );
      }
      const verAfterMatch = /после:\s*(app v[\d.]+,?\s*agent v[\d.]+,?\s*tgbot v[\d.]+)/i.exec(rawResult);
      const verSimpleMatch = /Версии:\s*(app v[\d.]+,?\s*agent v[\d.]+,?\s*tgbot v[\d.]+)/i.exec(rawResult);
      const verLine = verAfterMatch?.[1] ?? verSimpleMatch?.[1];
      if (verLine) {
        promptAboutLines.push(`Версии на момент генерации: ${verLine.trim()}`);
      }
      const prompt_about = promptAboutLines.join("\n\n");

      setBacklogForm((f) => ({
        ...f,
        description_prompt: parsed.prompt_markdown!,
        prompt_about,
      }));
      toast.success("Промпт для новой задачи сгенерирован моделью ИИ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сгенерировать промпт");
    } finally {
      setBacklogSaving(false);
    }
  }

  async function handleUpdateBacklog(id: string, payload: Partial<BacklogItem>) {
    setBacklogSaving(true);
    try {
      const res = await fetch(`/api/admin/backlog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      await fetchAdminData();
      await fetchBacklog(backlogPage);
      setBacklogEditId(null);
      toast.success("Запись обновлена");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось обновить");
    } finally {
      setBacklogSaving(false);
    }
  }

  async function handleDeleteBacklog(id: string) {
    if (!window.confirm("Удалить запись из бэклога?")) return;
    try {
      const res = await fetch(`/api/admin/backlog/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await fetchBacklog(backlogPage);
      toast.success("Запись удалена");
    } catch {
      toast.error("Не удалось удалить");
    }
  }

  async function handleGenerateBacklogPrompt(id: string, descriptionBefore?: string | null) {
    setBacklogSaving(true);
    try {
      const res = await fetch(`/api/admin/backlog/${id}/generate-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: backlogPromptModelEdit ?? null,
          prompt_scope: backlogPromptScopeEdit,
          description_before_generation: descriptionBefore ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Ошибка генерации промпта");
      }
      const row = data.row as BacklogItem | undefined;
      if (row) {
        setBacklog((prev) => prev.map((b) => (b.id === row.id ? row : b)));
        setBacklogEditForm((prev) => (prev.id === row.id ? { ...prev, ...row } : prev));
      } else {
        await fetchAdminData();
      }
      toast.success("Промпт для задачи сгенерирован моделью ИИ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сгенерировать промпт");
    } finally {
      setBacklogSaving(false);
    }
  }

  if (authLoading || (!authLoading && userRole !== "admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        {authLoading && (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
        )}
      </div>
    );
  }

  if (dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900">Панель управления</h1>
          {/* Десктопная панель действий */}
          <div className="hidden items-center gap-2 sm:flex">
            <Button variant="outline" size="sm" onClick={() => fetchAdminData()}>
              Обновить
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/terminal" target="_blank" rel="noopener noreferrer">
                Терминал
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/files" target="_blank" rel="noopener noreferrer">
                Файлы
              </Link>
            </Button>
            <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900 whitespace-nowrap">
              ← На главную
            </Link>
          </div>
          {/* Мобильное бургер-меню */}
          <div className="relative sm:hidden">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              type="button"
              aria-label="Меню действий админки"
              onClick={() => setAdminTopMenuOpen((v) => !v)}
            >
              <span className="flex flex-col items-center justify-center gap-0.5">
                <span className="h-0.5 w-4 rounded bg-zinc-800" />
                <span className="h-0.5 w-4 rounded bg-zinc-800" />
                <span className="h-0.5 w-4 rounded bg-zinc-800" />
              </span>
            </Button>
            {adminTopMenuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-zinc-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  onClick={() => {
                    setAdminTopMenuOpen(false);
                    fetchAdminData();
                  }}
                >
                  Обновить
                </button>
                <Link
                  href="/admin/terminal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  onClick={() => setAdminTopMenuOpen(false)}
                >
                  Терминал
                </Link>
                <Link
                  href="/admin/files"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  onClick={() => setAdminTopMenuOpen(false)}
                >
                  Файлы
                </Link>
                <Link
                  href="/"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  onClick={() => setAdminTopMenuOpen(false)}
                >
                  ← На главную
                </Link>
              </div>
            )}
          </div>
        </div>

        {dataError && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <p className="text-sm text-amber-800">{dataError}</p>
              <Button variant="outline" size="sm" onClick={() => { setDataLoading(true); fetchAdminData().finally(() => setDataLoading(false)); }}>
                Повторить
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-teal-200 bg-teal-50/50">
          <CardHeader className="pb-2">
            <h2 className="text-lg font-semibold text-teal-900">Telegram для админа</h2>
            <p className="text-sm text-muted-foreground">Привязка для бота «Спринт Комиссионки» (4.1)</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile?.telegram_id ? (
              <>
                <p className="text-sm text-teal-800">
                  Привязан: ID <code className="rounded bg-teal-100 px-1">{profile.telegram_id}</code>
                  {profile.telegram_username ? ` (@${profile.telegram_username})` : ""}
                </p>
                <Button variant="outline" size="sm" onClick={() => refreshProfile()}>
                  Обновить статус
                </Button>
              </>
            ) : telegramBindCode ? (
              <>
                <p className="text-sm font-medium text-teal-800">Отправьте боту код (действует 10 мин):</p>
                <p className="rounded border border-teal-200 bg-white px-3 py-2 font-mono text-lg font-bold text-teal-900">{telegramBindCode}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(telegramBindCode ?? "");
                    toast.success("Код скопирован");
                  }}
                >
                  Копировать
                </Button>
                <Button variant="outline" size="sm" onClick={() => refreshProfile()}>
                  Уже привязал — обновить
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setTelegramBindCode(null)}>
                  Отмена
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Привяжите Telegram, чтобы отправлять промпты боту.</p>
                <Button
                  size="sm"
                  disabled={telegramBindLoading}
                  onClick={async () => {
                    setTelegramBindLoading(true);
                    try {
                      const res = await fetch("/api/admin/telegram-bind-code", { method: "POST", credentials: "include" });
                      if (!res.ok) throw new Error(await res.text());
                      const data = await res.json();
                      setTelegramBindCode(data.code ?? null);
                      toast.success("Код создан");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Ошибка");
                    } finally {
                      setTelegramBindLoading(false);
                    }
                  }}
                >
                  {telegramBindLoading ? "Создаю код…" : "Привязать Telegram"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Tabs value={adminTab} onValueChange={(v) => setAdminTab(v ?? "items")} className="space-y-6">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="items">Товары</TabsTrigger>
            <TabsTrigger value="users">Пользователи</TabsTrigger>
            <TabsTrigger value="content">Контент</TabsTrigger>
            <TabsTrigger value="news">Новости</TabsTrigger>
            <TabsTrigger value="testimonials">Отзывы</TabsTrigger>
            <TabsTrigger value="backlog">Бэклог</TabsTrigger>
            <TabsTrigger value="ai">Комиссионка AI</TabsTrigger>
            <TabsTrigger value="tests">Тесты</TabsTrigger>
            <TabsTrigger value="cache">Кэш промптов</TabsTrigger>
            <TabsTrigger value="deploy">Деплой</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium text-muted-foreground">Товаров всего</p>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{itemsCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium text-muted-foreground">Сообщений всего</p>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{messagesCount}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Товары</h2>
              </CardHeader>
              <CardContent>
                {items.length > 0 ? (
                  <AdminItemsTable items={items} onDelete={handleDeleteItem} />
                ) : (
                  <p className="py-8 text-center text-muted-foreground">Нет товаров</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Последние сообщения в чатах</h2>
              </CardHeader>
              <CardContent>
                {messages.length > 0 ? (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div key={msg.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{msg.author_name ?? "Покупатель"}</span>
                          <span>{new Date(msg.created_at).toLocaleString("ru-RU")}</span>
                        </div>
                        <p className="mt-1 text-sm">{msg.content}</p>
                        <Link href={`/items/${msg.item_id}`} className="mt-2 inline-block text-xs text-primary hover:underline">
                          К товару →
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">Нет сообщений</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold">Управление пользователями</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportLoading}
                    onClick={handleExportActivity}
                  >
                    {exportLoading ? "Экспорт…" : "Экспорт всей активности пользователей"}
                  </Button>
                </div>
                <Input
                  placeholder="Поиск по имени или email..."
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  className="mt-2 max-w-sm"
                />
              </CardHeader>
              <CardContent>
                {filteredProfiles.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Имя</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Роль</TableHead>
                        <TableHead>В корзине</TableHead>
                        <TableHead>Избранное</TableHead>
                        <TableHead>Операции</TableHead>
                        <TableHead>Активность</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProfiles.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.full_name ?? "—"}</TableCell>
                          <TableCell>{p.email ?? "—"}</TableCell>
                          <TableCell>
                            <Select
                              value={p.role ?? "user"}
                              onValueChange={(v) => handleRoleChange(p.id, v as "user" | "admin")}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user" disabled={p.id === currentUser?.id && (p.role ?? "user") === "admin"}>
                                  user
                                </SelectItem>
                                <SelectItem value="admin">admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const titles = cartItemsByUser[p.id] ?? [];
                              const count = titles.length;
                              if (count === 0) return <span className="text-muted-foreground">0</span>;
                              return (
                                <button
                                  type="button"
                                  className="text-primary underline-offset-4 hover:underline"
                                  onClick={() => setCartDialog({ open: true, titles })}
                                >
                                  {count}
                                </button>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <TableCell>
                            {(() => {
                              const actions = activityByUser[p.id] ?? [];
                              const count = actions.length;
                              if (count === 0) return <span className="text-muted-foreground">0</span>;
                              return (
                                <button
                                  type="button"
                                  className="text-primary underline-offset-4 hover:underline"
                                  onClick={() => setActivityDialog({ open: true, actions })}
                                >
                                  {count}
                                </button>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {p.last_active_at
                              ? (() => {
                                  const d = new Date(p.last_active_at);
                                  const dd = String(d.getDate()).padStart(2, "0");
                                  const mm = String(d.getMonth() + 1).padStart(2, "0");
                                  const yy = String(d.getFullYear()).slice(-2);
                                  const hh = String(d.getHours()).padStart(2, "0");
                                  const min = String(d.getMinutes()).padStart(2, "0");
                                  return `${dd}.${mm}.${yy} ${hh}:${min}`;
                                })()
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">
                    {usersSearch ? "Ничего не найдено" : "Нет пользователей"}
                  </p>
                )}
              </CardContent>
            </Card>
            <ActivityOperationsDialog
              open={activityDialog.open}
              onOpenChange={(open) => setActivityDialog((d) => ({ ...d, open }))}
              actions={activityDialog.actions.map((a) => ({
                action_type: a.action_type,
                created_at: a.created_at,
                details: a.details as Record<string, string> | null,
              }))}
            />
            <Dialog open={cartDialog.open} onOpenChange={(open) => setCartDialog((d) => ({ ...d, open }))}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Товары в корзине</DialogTitle>
                </DialogHeader>
                {cartDialog.titles.length > 0 ? (
                  <ul className="max-h-80 list-disc space-y-1 overflow-y-auto pl-5">
                    {cartDialog.titles.map((title, i) => (
                      <li key={i}>{title}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Пусто</p>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Настройки главной страницы</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="hero_title">Заголовок Hero</Label>
                  <Input
                    id="hero_title"
                    value={contentForm.hero_title}
                    onChange={(e) => setContentForm((f) => ({ ...f, hero_title: e.target.value }))}
                    placeholder="Комиссионка: Вторая жизнь ваших вещей"
                  />
                </div>
                <div>
                  <Label htmlFor="hero_subtitle">Подзаголовок Hero</Label>
                  <Input
                    id="hero_subtitle"
                    value={contentForm.hero_subtitle}
                    onChange={(e) => setContentForm((f) => ({ ...f, hero_subtitle: e.target.value }))}
                    placeholder="Покупайте и продавайте..."
                  />
                </div>
                <div>
                  <Label htmlFor="h_banner">Высота баннера Hero (px)</Label>
                  <Input
                    id="h_banner"
                    type="text"
                    inputMode="numeric"
                    value={contentForm.h_banner}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (raw === "") {
                        setContentForm((f) => ({ ...f, h_banner: 200 }));
                        return;
                      }
                      const v = parseInt(raw, 10);
                      if (!Number.isNaN(v)) setContentForm((f) => ({ ...f, h_banner: v }));
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      const num = Number.isNaN(v) ? 200 : Math.max(80, Math.min(600, v));
                      setContentForm((f) => ({ ...f, h_banner: num }));
                    }}
                    placeholder="200"
                    className="w-24"
                  />
                </div>
                <div>
                  <Label htmlFor="news_banner_height">Высота баннера новостей (px)</Label>
                  <Input
                    id="news_banner_height"
                    type="text"
                    inputMode="numeric"
                    value={contentForm.news_banner_height}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (raw === "") {
                        setContentForm((f) => ({ ...f, news_banner_height: 200 }));
                        return;
                      }
                      const v = parseInt(raw, 10);
                      if (!Number.isNaN(v)) setContentForm((f) => ({ ...f, news_banner_height: v }));
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      const num = Number.isNaN(v) ? 200 : Math.max(80, Math.min(800, v));
                      setContentForm((f) => ({ ...f, news_banner_height: num }));
                    }}
                    placeholder="200"
                    className="w-24"
                  />
                </div>
                <div>
                  <Label htmlFor="news_scroll_speed">Скорость автоскролла новостей (px/сек)</Label>
                  <Input
                    id="news_scroll_speed"
                    type="text"
                    inputMode="numeric"
                    value={contentForm.news_scroll_speed}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (raw === "") {
                        setContentForm((f) => ({ ...f, news_scroll_speed: 3 }));
                        return;
                      }
                      const v = parseInt(raw, 10);
                      if (!Number.isNaN(v)) setContentForm((f) => ({ ...f, news_scroll_speed: v }));
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      const num = Number.isNaN(v) ? 3 : Math.max(0, Math.min(50, v));
                      setContentForm((f) => ({ ...f, news_scroll_speed: num }));
                    }}
                    placeholder="3"
                    className="w-24"
                  />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="catalog_min_columns">Минимальное число колонок каталога (1–4)</Label>
                    <Select
                      value={String(Math.min(4, Math.max(1, contentForm.catalog_min_columns ?? 2)))}
                      onValueChange={(v) => {
                        const num = parseInt(v, 10);
                        if (num >= 1 && num <= 4) setContentForm((f) => ({ ...f, catalog_min_columns: num }));
                      }}
                    >
                      <SelectTrigger id="catalog_min_columns" className="w-24">
                        <SelectValue placeholder="2" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="4">4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="catalog_max_card_width">Максимальная ширина карточки каталога (px)</Label>
                    <Input
                      id="catalog_max_card_width"
                      type="text"
                      inputMode="numeric"
                      value={contentForm.catalog_max_card_width}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (raw === "") {
                          setContentForm((f) => ({ ...f, catalog_max_card_width: 360 }));
                          return;
                        }
                        const v = parseInt(raw, 10);
                        if (!Number.isNaN(v)) {
                          const clamped = Math.max(200, Math.min(v, 600));
                          setContentForm((f) => ({ ...f, catalog_max_card_width: clamped }));
                        }
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        const num = Number.isNaN(v) ? 360 : Math.max(200, Math.min(v, 600));
                        setContentForm((f) => ({ ...f, catalog_max_card_width: num }));
                      }}
                      placeholder="360"
                      className="w-32"
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="catalog_gap_px">Расстояние между карточками (px)</Label>
                    <Input
                      id="catalog_gap_px"
                      type="text"
                      inputMode="numeric"
                      value={contentForm.catalog_gap_px}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (raw === "") {
                          setContentForm((f) => ({ ...f, catalog_gap_px: 24 }));
                          return;
                        }
                        const v = parseInt(raw, 10);
                        if (!Number.isNaN(v)) setContentForm((f) => ({ ...f, catalog_gap_px: v }));
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        const num = Number.isNaN(v) ? 24 : Math.max(8, Math.min(v, 64));
                        setContentForm((f) => ({ ...f, catalog_gap_px: num }));
                      }}
                      placeholder="24"
                      className="w-20"
                    />
                  </div>
                  <div>
                    <Label htmlFor="catalog_card_padding_px">Отступ текста в карточке от края (px)</Label>
                    <Input
                      id="catalog_card_padding_px"
                      type="text"
                      inputMode="numeric"
                      value={contentForm.catalog_card_padding_px}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (raw === "") {
                          setContentForm((f) => ({ ...f, catalog_card_padding_px: 24 }));
                          return;
                        }
                        const v = parseInt(raw, 10);
                        if (!Number.isNaN(v)) setContentForm((f) => ({ ...f, catalog_card_padding_px: v }));
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        const num = Number.isNaN(v) ? 24 : Math.max(8, Math.min(v, 48));
                        setContentForm((f) => ({ ...f, catalog_card_padding_px: num }));
                      }}
                      placeholder="24"
                      className="w-20"
                    />
                  </div>
                  <div>
                    <Label htmlFor="catalog_title_font_px">Размер шрифта заголовка карточки (px)</Label>
                    <Input
                      id="catalog_title_font_px"
                      type="text"
                      inputMode="numeric"
                      value={contentForm.catalog_title_font_px}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (raw === "") {
                          setContentForm((f) => ({ ...f, catalog_title_font_px: 18 }));
                          return;
                        }
                        const v = parseInt(raw, 10);
                        if (!Number.isNaN(v)) setContentForm((f) => ({ ...f, catalog_title_font_px: v }));
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        const num = Number.isNaN(v) ? 18 : Math.max(12, Math.min(v, 28));
                        setContentForm((f) => ({ ...f, catalog_title_font_px: num }));
                      }}
                      placeholder="18"
                      className="w-20"
                    />
                  </div>
                  <div>
                    <Label htmlFor="catalog_text_font_px">Размер шрифта текста карточки (px)</Label>
                    <Input
                      id="catalog_text_font_px"
                      type="text"
                      inputMode="numeric"
                      value={contentForm.catalog_text_font_px}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (raw === "") {
                          setContentForm((f) => ({ ...f, catalog_text_font_px: 14 }));
                          return;
                        }
                        const v = parseInt(raw, 10);
                        if (!Number.isNaN(v)) setContentForm((f) => ({ ...f, catalog_text_font_px: v }));
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        const num = Number.isNaN(v) ? 14 : Math.max(10, Math.min(v, 24));
                        setContentForm((f) => ({ ...f, catalog_text_font_px: num }));
                      }}
                      placeholder="14"
                      className="w-20"
                    />
                  </div>
                </div>
                <div>
                  <Label>Hero-изображение</Label>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {contentForm.hero_image_url && (
                      <img
                        src={(() => {
                          const base = contentForm.hero_image_url ?? "";
                          const raw = `${base}?t=${heroPreviewKey}`;
                          if (typeof window !== "undefined") {
                            if (base.startsWith("http://") || base.startsWith("https://")) return raw;
                            const path = base.startsWith("/") ? base : `/${base}`;
                            return window.location.origin + path + `?t=${heroPreviewKey}`;
                          }
                          return raw;
                        })()}
                        alt="Hero"
                        className="h-24 w-auto rounded border object-cover"
                      />
                    )}
                    <div>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setHeroImageFile(e.target.files?.[0] ?? null)}
                        className="cursor-pointer"
                      />
                      {heroImageFile && (
                        <p className="mt-1 text-sm text-muted-foreground">Выбран: {heroImageFile.name}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Загрузите в бакет hero-images
                      </p>
                    </div>
                  </div>
                </div>
                <Button onClick={handleSaveContent} disabled={contentSaving}>
                  {contentSaving ? "Сохранение…" : "Сохранить"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="news" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Добавить новость</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="news_title">Заголовок</Label>
                  <Input
                    id="news_title"
                    value={newsForm.title}
                    onChange={(e) => setNewsForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Заголовок новости"
                  />
                </div>
                <div>
                  <Label htmlFor="news_body">Текст (Markdown)</Label>
                  <Textarea
                    id="news_body"
                    value={newsForm.body}
                    onChange={(e) => setNewsForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Поддерживается Markdown: **жирный**, *курсив*, [ссылка](url)..."
                    className="min-h-[120px] font-mono text-sm"
                  />
                </div>
                <Button onClick={handleCreateNews} disabled={newsSaving}>
                  {newsSaving ? "Сохранение…" : "Создать новость"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Список новостей</h2>
              </CardHeader>
              <CardContent>
                {news.length > 0 ? (
                  <div className="space-y-3">
                    {news.map((n) => (
                      <div key={n.id} className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium">{n.title ?? "Без заголовка"}</h3>
                          <div className="prose prose-sm mt-1 line-clamp-2 max-w-none prose-p:my-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.body ?? ""}</ReactMarkdown>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(n.created_at).toLocaleString("ru-RU")}
                          </p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteNews(n.id)}>
                          Удалить
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">Нет новостей</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backlog" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Добавить запись в бэклог</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>№ тикета (авто)</Label>
                    <Input
                      type="number"
                      value={(backlog.length || 0) + 1}
                      readOnly
                      disabled
                      className="w-24"
                    />
                  </div>
                  <div>
                    <Label>№ спринта</Label>
                    <Input
                      type="number"
                      min={0}
                      value={backlogForm.sprint_number}
                      onChange={(e) =>
                        setBacklogForm((f) => ({ ...f, sprint_number: parseInt(e.target.value, 10) || 0 }))
                      }
                      className="w-24"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Статус спринта</Label>
                    <Select
                      value={backlogForm.sprint_status}
                      onValueChange={(v) => setBacklogForm((f) => ({ ...f, sprint_status: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BACKLOG_SPRINT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Статус задачи</Label>
                    <Select
                      value={backlogForm.task_status}
                      onValueChange={(v) => setBacklogForm((f) => ({ ...f, task_status: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BACKLOG_TASK_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Краткое описание</Label>
                  <Input
                    value={backlogForm.short_description}
                    onChange={(e) => setBacklogForm((f) => ({ ...f, short_description: e.target.value }))}
                    placeholder="Кратко о задаче"
                    maxLength={1024}
                  />
                </div>
                <div>
                  <Label>Описание / промпт для ИИ</Label>
                  <WysiwygEditor
                    value={backlogForm.description_prompt}
                    onChange={(v) => setBacklogForm((f) => ({ ...f, description_prompt: v }))}
                    placeholder="Подробное описание, промпт для ИИ, требования"
                    minHeight={280}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={backlogPromptScopeNew}
                    onValueChange={(v) => setBacklogPromptScopeNew(v as "brief" | "standard" | "full")}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brief">Кратко</SelectItem>
                      <SelectItem value="standard">Стандарт</SelectItem>
                      <SelectItem value="full">Полная детализация</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={backlogPromptModelNew ?? "__env__"}
                    onValueChange={(v) => {
                      const model = v === "__env__" ? null : v;
                      setBacklogPromptModelNew(model);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[220px] text-xs">
                      <SelectValue placeholder="Модель для генерации" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__env__">Из настроек (site_settings)</SelectItem>
                      {agentModels.map((m) => (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          disabled={m.provider === "openrouter" && !hasOpenRouterKey}
                        >
                          <span className="flex items-center gap-1.5">
                            {m.typeIcon ? (
                              <span
                                aria-hidden
                                title={
                                  m.typeIcon === "🖼️"
                                    ? "Генерация изображений"
                                    : m.typeIcon === "📝"
                                    ? "Текст"
                                    : "Другое"
                                }
                              >
                                {m.typeIcon}
                              </span>
                            ) : null}
                            {m.name}
                            {m.provider === "openrouter" && !hasOpenRouterKey
                              ? " (добавьте AGENT_OPENROUTER_API_KEY)"
                              : ""}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={backlogSaving}
                    onClick={handleGenerateBacklogPromptNew}
                  >
                    {backlogSaving ? "Генерация…" : "Сгенерировать промпт ИИ"}
                  </Button>
                </div>
                {backlogForm.prompt_about && (
                  <div>
                    <Label>Об этом промпте</Label>
                    <div className="rounded border bg-muted/50 overflow-hidden">
                      <div className="flex items-center h-9 min-h-[2.25rem] max-h-[2.25rem] px-2 border-b border-border/50">
                        <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
                          Исходно задача звучала так: …
                        </span>
                        <button
                          type="button"
                          aria-label={promptAboutExpandedNew ? "Свернуть" : "Раскрыть"}
                          onClick={() => setPromptAboutExpandedNew((v) => !v)}
                          className={cn(
                            "shrink-0 w-8 h-8 flex items-center justify-center text-muted-foreground hover:bg-muted/70 rounded transition-all",
                            promptAboutExpandedNew && "rotate-180"
                          )}
                        >
                          ▼
                        </button>
                      </div>
                      <div
                        className={cn(
                          "overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground",
                          promptAboutExpandedNew ? "max-h-[15em] leading-normal p-2" : "max-h-0 overflow-hidden p-0"
                        )}
                      >
                        {backlogForm.prompt_about}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label>Тип задачи</Label>
                    <Input value="—" readOnly disabled />
                  </div>
                  <div>
                    <Label>Модули</Label>
                    <Input value="—" readOnly disabled />
                  </div>
                  <div>
                    <Label>Компоненты</Label>
                    <Input value="—" readOnly disabled />
                  </div>
                  <div>
                    <Label>Сложность (1–5)</Label>
                    <Input value="—" readOnly disabled />
                  </div>
                </div>
                <div>
                  <Label>Ссылка на документацию после реализации</Label>
                  <Input
                    value={backlogForm.doc_link}
                    onChange={(e) => setBacklogForm((f) => ({ ...f, doc_link: e.target.value }))}
                    placeholder="URL или путь в docs/"
                  />
                </div>
                <div>
                  <Label>Порядок тестирования / ожидаемый результат или ссылка на сценарии в ./doc</Label>
                  <Textarea
                    value={backlogForm.test_order_or_link}
                    onChange={(e) => setBacklogForm((f) => ({ ...f, test_order_or_link: e.target.value }))}
                    placeholder="Кратко или ссылка на docs/..."
                    className="min-h-[80px] resize-y"
                  />
                </div>
                <Button onClick={handleCreateBacklog} disabled={backlogSaving}>
                  {backlogSaving ? "Сохранение…" : "Добавить запись"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Таблица бэклога</h2>
                <p className="text-sm text-muted-foreground">
                  Дубликат в docs/backlog.md обновляется при каждом изменении.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Select value={backlogSort} onValueChange={(v) => setBacklogSort(v as typeof backlogSort)}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Сортировка" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="order_num">По №</SelectItem>
                      <SelectItem value="short_description">По описанию</SelectItem>
                      <SelectItem value="created_at">По дате создания</SelectItem>
                      <SelectItem value="task_status">По статусу задачи</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={backlogOrder} onValueChange={(v) => setBacklogOrder(v as "asc" | "desc")}>
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">По возрастанию</SelectItem>
                      <SelectItem value="desc">По убыванию</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={backlogFilterStatus} onValueChange={setBacklogFilterStatus}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="Статус задачи" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Все</SelectItem>
                      {BACKLOG_TASK_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={backlogFilterType} onValueChange={setBacklogFilterType}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Тип задачи" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Все</SelectItem>
                      <SelectItem value="bug">bug</SelectItem>
                      <SelectItem value="feature">feature</SelectItem>
                      <SelectItem value="data_change">data_change</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="secondary" size="sm" onClick={() => fetchBacklog(1)}>
                    Обновить список
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {backlog.length > 0 ? (
                  <Table className="text-[0.8rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 px-2">№</TableHead>
                        <TableHead className="w-14 px-2">Спринт</TableHead>
                        <TableHead className="px-2">Статус спринта</TableHead>
                        <TableHead className="px-2">Краткое описание</TableHead>
                        <TableHead className="w-20 px-2">Тип</TableHead>
                        <TableHead className="w-12 px-2">Сл.</TableHead>
                        <TableHead className="px-2">Статус задачи</TableHead>
                        <TableHead className="w-16 px-2 text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backlog.map((b, idx) => (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer"
                          onDoubleClick={() => {
                            setBacklogEditForm({ ...b });
                            setBacklogEditId(b.id);
                            setBacklogPromptModelEdit(b.prompt_model ?? selectedAgentModel ?? null);
                            setPromptAboutExpandedEdit(false);
                          }}
                        >
                          <TableCell className="px-2 py-1">{b.order_num ?? idx + 1}</TableCell>
                          <TableCell className="px-2 py-1">{b.sprint_number}</TableCell>
                          <TableCell className="px-2 py-1 whitespace-nowrap">{b.sprint_status}</TableCell>
                          <TableCell className="px-2 py-1 max-w-[280px] break-words" title={b.short_description}>
                            {b.short_description}
                          </TableCell>
                          <TableCell className="px-2 py-1 whitespace-nowrap">{b.task_type ?? "—"}</TableCell>
                          <TableCell className="px-2 py-1">{b.complexity != null ? String(b.complexity) : "—"}</TableCell>
                          <TableCell className="px-2 py-1 whitespace-nowrap">{b.task_status}</TableCell>
                          <TableCell className="px-2 py-1 text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 mr-1"
                              title="Изменить"
                              onClick={() => {
                                setBacklogEditForm({ ...b });
                                setBacklogEditId(b.id);
                                setBacklogPromptModelEdit(b.prompt_model ?? selectedAgentModel ?? null);
                                setPromptAboutExpandedEdit(false);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              title="Удалить"
                              onClick={() => handleDeleteBacklog(b.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">Нет записей в бэклоге</p>
                )}
                {backlogTotal > 0 && (
                  <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
                    <span>
                      Страница {backlogPage} из {Math.max(1, Math.ceil(backlogTotal / 100))}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={backlogPage <= 1}
                        onClick={() => fetchBacklog(backlogPage - 1)}
                      >
                        Предыдущая
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={backlogPage >= Math.ceil(backlogTotal / 100)}
                        onClick={() => fetchBacklog(backlogPage + 1)}
                      >
                        Следующая
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog
              open={backlogEditId !== null}
              onOpenChange={(open) => {
                if (!open) {
                  setBacklogEditId(null);
                  setBacklogEditForm({});
                  setPromptAboutExpandedEdit(false);
                }
              }}
            >
              {(() => {
                const row = backlogEditId ? backlog.find((b) => b.id === backlogEditId) : null;
                if (!row) return null;
                const ef = backlogEditForm.id === row.id ? backlogEditForm : { ...row };
                const setEf = (up: Partial<BacklogItem>) =>
                  setBacklogEditForm((prev) => (prev.id === row.id ? { ...prev, ...up } : { ...row, ...up }));
                return (
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Редактировать запись бэклога</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>№ тикета</Label>
                          <Input
                            type="number"
                            value={row.order_num ?? (backlog.findIndex((b) => b.id === row.id) + 1)}
                            readOnly
                            disabled
                            className="w-24"
                          />
                        </div>
                        <div>
                          <Label>№ спринта</Label>
                          <Input
                            type="number"
                            min={0}
                            value={ef.sprint_number ?? ""}
                            onChange={(e) => setEf({ sprint_number: parseInt(e.target.value, 10) || 0 })}
                            className="w-24"
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>Статус спринта</Label>
                          <Select
                            value={ef.sprint_status ?? ""}
                            onValueChange={(v) => setEf({ sprint_status: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BACKLOG_SPRINT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Статус задачи</Label>
                          <Input value={ef.task_status ?? ""} readOnly className="bg-muted" />
                        </div>
                      </div>
                      <div>
                        <Label>Краткое описание</Label>
                        <Input
                          value={ef.short_description ?? ""}
                          onChange={(e) => setEf({ short_description: e.target.value })}
                          maxLength={1024}
                        />
                      </div>
                      <div>
                        <Label>Описание / промпт для ИИ</Label>
                        <WysiwygEditor
                          value={ef.description_prompt ?? ""}
                          onChange={(v) => setEf({ description_prompt: v })}
                          placeholder="Промпт для ИИ"
                          minHeight={220}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={backlogPromptScopeEdit}
                          onValueChange={(v) => setBacklogPromptScopeEdit(v as "brief" | "standard" | "full")}
                        >
                          <SelectTrigger className="h-8 w-[160px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="brief">Кратко</SelectItem>
                            <SelectItem value="standard">Стандарт</SelectItem>
                            <SelectItem value="full">Полная детализация</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={backlogPromptModelEdit ?? "__env__"}
                          onValueChange={(v) => {
                            const model = v === "__env__" ? null : v;
                            setBacklogPromptModelEdit(model);
                          }}
                        >
                          <SelectTrigger className="h-8 w-[220px] text-xs">
                            <SelectValue placeholder="Модель для генерации" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__env__">Из настроек (site_settings)</SelectItem>
                            {agentModels.map((m) => (
                              <SelectItem
                                key={m.id}
                                value={m.id}
                                disabled={m.provider === "openrouter" && !hasOpenRouterKey}
                              >
                                <span className="flex items-center gap-1.5">
                                  {m.typeIcon ? (
                                    <span
                                      aria-hidden
                                      title={
                                        m.typeIcon === "🖼️"
                                          ? "Генерация изображений"
                                          : m.typeIcon === "📝"
                                          ? "Текст"
                                          : "Другое"
                                      }
                                    >
                                      {m.typeIcon}
                                    </span>
                                  ) : null}
                                  {m.name}
                                  {m.provider === "openrouter" && !hasOpenRouterKey
                                    ? " (добавьте AGENT_OPENROUTER_API_KEY)"
                                    : ""}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={backlogSaving}
                          onClick={() => handleGenerateBacklogPrompt(row.id, ef.description_prompt ?? row.description_prompt)}
                        >
                          {backlogSaving ? "Генерация…" : "Сгенерировать промпт ИИ"}
                        </Button>
                        {row.prompt_log_id && (
                          <a
                            href={`/api/admin/agent/log?logId=${encodeURIComponent(row.prompt_log_id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            Лог рассуждений модели →
                          </a>
                        )}
                        {row.prompt_model && row.prompt_created_at && (
                          <span className="text-xs text-muted-foreground">
                            Модель: {row.prompt_model},{" "}
                            {new Date(row.prompt_created_at).toLocaleString("ru-RU")}
                            {row.prompt_duration_sec != null ? ` (${row.prompt_duration_sec} с)` : null}
                          </span>
                        )}
                      </div>
                      {(row.prompt_about ?? ef.prompt_about) && (
                        <div>
                          <Label>Об этом промпте</Label>
                          <div className="rounded border bg-muted/50 overflow-hidden">
                            <div className="flex items-center h-9 min-h-[2.25rem] max-h-[2.25rem] px-2 border-b border-border/50">
                              <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
                                Исходно задача звучала так: …
                              </span>
                              <button
                                type="button"
                                aria-label={promptAboutExpandedEdit ? "Свернуть" : "Раскрыть"}
                                onClick={() => setPromptAboutExpandedEdit((v) => !v)}
                                className={cn(
                                  "shrink-0 w-8 h-8 flex items-center justify-center text-muted-foreground hover:bg-muted/70 rounded transition-all",
                                  promptAboutExpandedEdit && "rotate-180"
                                )}
                              >
                                ▼
                              </button>
                            </div>
                            <div
                              className={cn(
                                "overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground",
                                promptAboutExpandedEdit ? "max-h-[15em] leading-normal p-2" : "max-h-0 overflow-hidden p-0"
                              )}
                            >
                              {row.prompt_about ?? ef.prompt_about ?? ""}
                            </div>
                          </div>
                        </div>
                      )}
                      <div>
                        <Label>Ссылка на документацию</Label>
                        <Input
                          value={ef.doc_link ?? ""}
                          onChange={(e) => setEf({ doc_link: e.target.value || null })}
                        />
                      </div>
                      <div>
                        <Label>Тестирование / ссылка на сценарии</Label>
                        <Textarea
                          value={ef.test_order_or_link ?? ""}
                          onChange={(e) => setEf({ test_order_or_link: e.target.value || null })}
                          className="min-h-[60px] resize-y"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <Label>Тип задачи</Label>
                          <Input value={row.task_type ?? "—"} readOnly disabled />
                        </div>
                        <div>
                          <Label>Модули</Label>
                          <Input value={row.modules ?? "—"} readOnly disabled />
                        </div>
                        <div>
                          <Label>Компоненты</Label>
                          <Input value={row.components ?? "—"} readOnly disabled />
                        </div>
                        <div>
                          <Label>Сложность (1–5)</Label>
                          <Input
                            value={row.complexity != null ? String(row.complexity) : "—"}
                            readOnly
                            disabled
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() =>
                            handleUpdateBacklog(row.id, {
                              order_num: ef.order_num,
                              sprint_number: ef.sprint_number,
                              sprint_status: ef.sprint_status,
                              short_description: ef.short_description,
                              description_prompt: ef.description_prompt,
                              task_status: ef.task_status,
                              doc_link: ef.doc_link,
                              test_order_or_link: ef.test_order_or_link,
                              prompt_about: ef.prompt_about ?? null,
                            })
                          }
                          disabled={backlogSaving}
                        >
                          {backlogSaving ? "Сохранение…" : "Сохранить"}
                        </Button>
                        <Button variant="outline" onClick={() => setBacklogEditId(null)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                );
              })()}
            </Dialog>
          </TabsContent>

          <TabsContent value="ai" className="space-y-6 overflow-x-hidden">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Чат с ИИ</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Агент работает по принципу Cursor: сначала задаёт уточняющие вопросы и предлагает план, затем сам по шагам выполняет задачу
                  в рамках одного диалога. Никаких технических подтверждений «да» или вводов кода больше не требуется — просто отвечайте на вопросы
                  и формулируйте следующую команду в чате.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 gap-y-3">
                  <span className="shrink-0 text-sm text-muted-foreground">Модель:</span>
                  <Select
                    value={selectedAgentModel ?? "__env__"}
                    onValueChange={async (v) => {
                      const model = v === "__env__" ? null : v;
                      setAgentModelSaving(true);
                      try {
                        const res = await fetch("/api/admin/agent/model", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ model }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          toast.error(data.error ?? "Ошибка сохранения");
                          return;
                        }
                        setSelectedAgentModel(model);
                        toast.success("Модель сохранена");
                      } catch {
                        toast.error("Ошибка сохранения");
                      } finally {
                        setAgentModelSaving(false);
                      }
                    }}
                    disabled={agentModelSaving}
                  >
                    <SelectTrigger className="h-8 min-w-0 max-w-full text-sm sm:w-[220px]">
                      <SelectValue placeholder="Из .env" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__env__">Из .env (по умолчанию)</SelectItem>
                      {agentModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} disabled={m.provider === "openrouter" && !hasOpenRouterKey}>
                          <span className="flex items-center gap-1.5">
                            {m.typeIcon ? <span aria-hidden title={m.typeIcon === "🖼️" ? "Генерация изображений" : m.typeIcon === "📝" ? "Текст" : "Другое"}>{m.typeIcon}</span> : null}
                            {m.name}{m.provider === "openrouter" && !hasOpenRouterKey ? " (добавьте AGENT_OPENROUTER_API_KEY)" : ""}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Link href="/admin/agent-models-help" className="text-xs text-primary hover:underline" title="Справка по моделям Google AI Pro">
                    Справка по моделям
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 overflow-x-hidden md:flex-row md:gap-6">
                {/* Боковая панель: закладки сессий и ход выполнения — на смартфоне внизу, на десктопе слева */}
                <div className="order-2 flex w-full shrink-0 flex-col gap-2 md:order-1 md:w-52">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="shrink-0" onClick={createNewAiChat}>
                      + Новый чат
                    </Button>
                    {activeAiSessionId && (
                      <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={clearCurrentAiChat}>
                        Очистить
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:max-h-36">
                    {aiSessions.map((s) => (
                      <div key={s.id} className="group flex min-w-[140px] shrink-0 items-center gap-1 rounded-md hover:bg-zinc-100 md:min-w-0 md:shrink">
                        <button
                          type="button"
                          className={`truncate rounded px-2 py-1.5 text-left text-sm md:min-w-0 md:flex-1 ${
                            s.id === activeAiSessionId ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"
                          }`}
                          onClick={() => setActiveAiSessionId(s.id)}
                          title={s.title}
                        >
                          {s.title}
                        </button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-70 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100" onClick={() => deleteAiChat(s.id)} title="Удалить чат">
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex h-[200px] flex-col rounded border border-zinc-200 bg-zinc-50/50 p-2 md:h-[340px]">
                    <p className="mb-1 shrink-0 text-xs font-medium text-muted-foreground">Ход выполнения</p>
                    <div className="min-h-0 flex-1 overflow-y-auto text-xs">
                      {aiLastSteps.length === 0 && !aiLoading && <p className="text-muted-foreground">—</p>}
                      {aiLastSteps.map((s, i) => {
                        const isToolError =
                          s.type === "tool" &&
                          s.success === false &&
                          typeof s.toolResultSummary === "string" &&
                          /error|ошибка/i.test(s.toolResultSummary);
                        return (
                          <div key={i} className="mb-2 rounded border border-zinc-200 bg-white p-2">
                            <div className="flex gap-1.5">
                              <span
                                className={
                                  s.type === "llm"
                                    ? "text-blue-600"
                                    : s.type === "tool"
                                      ? "text-amber-600"
                                      : "text-green-600"
                                }
                              >
                                {s.type === "llm" ? "●" : s.type === "tool" ? "◆" : "✓"}
                              </span>
                              <span className="font-medium break-words">
                                {s.text}
                                {s.detail ? ` — ${s.detail}` : ""}
                              </span>
                              {isToolError && <span className="text-red-600">ошибка</span>}
                              {s.type === "tool" && s.success === true && <span className="text-green-600">OK</span>}
                            </div>
                            {s.requestSummary && (
                              <p className="mt-1 break-words text-zinc-600">{s.requestSummary}</p>
                            )}
                            {s.toolName && (
                              <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-500">
                                Инструмент: {s.toolName}
                              </p>
                            )}
                            {s.toolArgs && (
                              <p className="mt-0.5 break-all font-mono text-[10px] text-zinc-500">
                                Аргументы: {s.toolArgs}
                              </p>
                            )}
                            {s.toolResultSummary && (
                              <p className="mt-0.5 break-words text-zinc-600">
                                Результат: {s.toolResultSummary}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      {aiLastLogId && (
                        <a
                          href={`/api/admin/agent/log?logId=${encodeURIComponent(aiLastLogId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block shrink-0 text-xs text-primary hover:underline"
                        >
                          Весь путь рассуждений →
                        </a>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={statusDumping}
                          onClick={async () => {
                            setStatusDumping(true);
                            setStatusDumpResult(null);
                            try {
                              const res = await fetch("/api/admin/status-dump", { method: "POST" });
                              const data = await res.json();
                              if (!res.ok || !data?.ok) {
                                setStatusDumpResult(
                                  `Ошибка дампа: ${data?.error || res.status + " " + res.statusText}`,
                                );
                              } else {
                                setStatusDumpResult(
                                  `Файл: ${data.path || "не распознан"}\n\n${data.stdout || ""}`.trim(),
                                );
                              }
                            } catch (e) {
                              setStatusDumpResult(
                                `Ошибка запроса: ${e instanceof Error ? e.message : String(e)}`,
                              );
                            } finally {
                              setStatusDumping(false);
                            }
                          }}
                        >
                          {statusDumping ? "Дамп состояния…" : "ДАМП СОСТОЯНИЯ"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {statusDumpResult && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded border bg-muted p-2 text-xs whitespace-pre-wrap">
                      {statusDumpResult}
                    </pre>
                  )}
                </div>
                {/* Чат с ИИ — на смартфоне сверху (приоритет), на десктопе справа */}
                <div className="order-1 flex min-w-0 flex-1 flex-col gap-4 md:order-2">
                  <div
                    className={cn(
                      "flex gap-1 rounded border p-1",
                      aiMode === "dev"
                        ? "border-amber-500 bg-amber-50"
                        : "border-zinc-200 bg-zinc-100"
                    )}
                    role="radiogroup"
                    aria-label="Режим ИИ"
                  >
                    {(["chat", "consult", "dev"] as const).map((m) => (
                      <label key={m} className="flex flex-1 cursor-pointer items-center justify-center">
                        <input type="radio" name="ai-mode" value={m} checked={aiMode === m} onChange={() => setAiMode(m)} className="sr-only" />
                        <span
                          className={cn(
                            "rounded px-2 py-1 text-xs font-medium",
                            aiMode === m
                              ? m === "dev"
                                ? "bg-amber-500 text-white shadow-sm ring-2 ring-amber-600"
                                : "bg-white text-zinc-900 shadow-sm"
                              : "text-zinc-600"
                          )}
                        >
                          {getModeButtonLabel(m)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div
                    ref={chatScrollRef}
                    className="flex h-[280px] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-4 sm:h-[360px] md:h-[420px]"
                  >
                    {aiMessages.length === 0 && !aiLoading && (
                      <p className="text-center text-muted-foreground">Напишите сообщение, чтобы начать диалог с ИИ.</p>
                    )}
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm", msg.role === "user" ? "self-end rounded-br-md bg-primary text-primary-foreground" : "self-start rounded-bl-md bg-white")}>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm max-w-none text-sm [&_pre]:whitespace-pre-wrap [&_code]:break-all [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:object-contain">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                              img: ({ src, alt }) => {
                                const s = typeof src === "string" ? src : "";
                                const href = s.startsWith("/") && typeof window !== "undefined"
                                  ? window.location.origin + s
                                  : s || "";
                                return <img src={href} alt={alt ?? "generated"} className="max-w-full rounded border object-contain" />;
                              },
                            }}>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                        )}
                        <p className="mt-1 text-right text-xs opacity-90">
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </p>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-white px-4 py-2 shadow-sm">
                        <p className="text-sm text-zinc-500">Думаю…</p>
                      </div>
                    )}
                    <div ref={chatBottomRef} className="h-0 shrink-0" aria-hidden />
                  </div>
                  <form
                    className="flex flex-col gap-2 sm:flex-row sm:items-end"
                    onSubmit={async (e) => {
                            e.preventDefault();
                            const text = aiInput.trim();
                            if ((!text && !aiInputImageDataUrl) || aiLoading || !activeAiSessionId) return;
                            const imageRequestPattern = /\b(нарисуй|картинку|изображени[ея]|сгенерируй\s+(картинку|изображение)|draw|picture|image|generate\s+(an?\s+)?(image|picture))\b/i;
                            if (imageRequestPattern.test(text) && selectedAgentModel && !isImageCapableModel(selectedAgentModel)) {
                              toast.warning("Для генерации изображений выберите Nano Banana или Nano Banana Pro в списке моделей.");
                            }
                            if (aiMode === "dev") {
                              const truncated = text.length > 80 ? `${text.slice(0, 80)}…` : text;
                              if (!window.confirm(`⚠️ ВНИМАНИЕ! Прямой доступ к коду.\n\nВы уверены, что хотите отправить запрос «${truncated}» в режиме «Разработка»?`)) return;
                            }
                            const userPromptForAgent =
                              text || (aiInputImageDataUrl ? "Проанализируй вложенное изображение, приложенное к запросу." : "");
                            setAiInput("");
                            const userVisible =
                              text ||
                              (aiInputImageDataUrl ? "[запрос с вложенным изображением без подписи]" : "");
                            setAiMessagesForCurrentSession((prev) => [
                              ...prev,
                              { role: "user", content: userVisible || userPromptForAgent, timestamp: Date.now() },
                            ]);
                            updateActiveSessionTitle(userPromptForAgent);
                            setAiLoading(true);
                            // Сразу показываем ход выполнения для ТЕКУЩЕГО запроса (иначе при ошибке оставались шаги прошлого ответа).
                            setAiLastLogId(null);
                            {
                              const p = userPromptForAgent;
                              const short =
                                p.length > 160 ? `${p.slice(0, 160)}…` : p;
                              setAiLastSteps([
                                {
                                  type: "llm",
                                  text: "Запрос отправлен",
                                  detail: `Ожидание ответа агента… Промпт (${p.length} симв.): ${short}`,
                                },
                              ]);
                            }
                            type StepItem = { type: string; text: string; detail?: string; requestSummary?: string; toolName?: string; toolArgs?: string; toolResultSummary?: string; success?: boolean };
                            const historyForRequest = activeAiSession?.messages ?? [];
                            const controller = new AbortController();
                            const AGENT_TIMEOUT_MS = aiMode === "dev" ? 10 * 60_000 : 3 * 60_000;
                            const timeoutId = window.setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
                            try {
                              // SSE-стриминг иногда падает в Next.js (failed to pipe response / ECONNRESET),
                              // из-за чего пользователь видит "Не удалось отправить запрос к агенту".
                              // Здесь используем надёжный режим: один JSON-ответ с результатом, шагами и logId.
                              const res = await fetch("/api/admin/agent/run", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  prompt: userPromptForAgent,
                                  history: historyForRequest,
                                  stream: false,
                                  mode: aiMode,
                                  project: "Комиссионка",
                                  chatName: activeAiSession?.title ?? undefined,
                                  inputImages: aiInputImageDataUrl ? [aiInputImageDataUrl] : undefined,
                                }),
                                signal: controller.signal,
                              });
                              let data: {
                                result?: string;
                                error?: string;
                                steps?: Array<{
                                  type: string;
                                  text: string;
                                  detail?: string;
                                  requestSummary?: string;
                                  toolName?: string;
                                  toolArgs?: string;
                                  toolResultSummary?: string;
                                  success?: boolean;
                                }>;
                                logId?: string | null;
                              } = {};
                              try {
                                data = (await res.json()) as typeof data;
                              } catch {
                                data = {};
                              }
                              if (!res.ok) {
                                const errMsg = data.error ?? String(res.status);
                                const errSteps =
                                  Array.isArray(data.steps) && data.steps.length > 0
                                    ? data.steps
                                    : ([
                                        {
                                          type: "llm",
                                          text: "Ошибка API",
                                          detail: errMsg,
                                          success: false,
                                        },
                                      ] satisfies StepItem[]);
                                setAiLastSteps(errSteps);
                                setAiLastLogId(
                                  typeof data.logId === "string" && data.logId.length > 0
                                    ? data.logId
                                    : null
                                );
                                setAiMessagesForCurrentSession((prev) => [
                                  ...prev,
                                  { role: "assistant", content: `Ошибка: ${errMsg}`, timestamp: Date.now() },
                                ]);
                                appendAgentDiagnoseToChat();
                                return;
                              }
                              setAiLastSteps(data.steps ?? []);
                              setAiLastLogId(data.logId ?? null);
                              setAiMessagesForCurrentSession((prev) => [
                                ...prev,
                                { role: "assistant", content: normalizeAgentResultForDisplay(data.result ?? ""), timestamp: Date.now() },
                              ]);
                            } catch (err) {
                              if (err instanceof DOMException && err.name === "AbortError") {
                                const minutes = AGENT_TIMEOUT_MS / 60_000;
                                setAiLastSteps([
                                  {
                                    type: "llm",
                                    text: "Таймаут",
                                    detail: `Агент не ответил за ${minutes} мин. Запрос прерван.`,
                                    success: false,
                                  },
                                ]);
                                setAiLastLogId(null);
                                setAiMessagesForCurrentSession((prev) => [
                                  ...prev,
                                  {
                                    role: "assistant",
                                    content: `Агент не ответил в течение ${minutes} минут, запрос прерван. Попробуйте ещё раз или уточните задачу.`,
                                    timestamp: Date.now(),
                                  },
                                ]);
                              } else {
                                const detail =
                                  err instanceof Error ? err.message : String(err);
                                setAiLastSteps([
                                  {
                                    type: "llm",
                                    text: "Не удалось выполнить запрос",
                                    detail:
                                      detail ||
                                      "Сеть, разбор JSON или обрыв соединения. Нажмите «Дамп состояния» для диагностики.",
                                    success: false,
                                  },
                                ]);
                                setAiLastLogId(null);
                                setAiMessagesForCurrentSession((prev) => [
                                  ...prev,
                                  { role: "assistant", content: "Не удалось отправить запрос к агенту.", timestamp: Date.now() },
                                ]);
                                appendAgentDiagnoseToChat();
                              }
                            } finally {
                              window.clearTimeout(timeoutId);
                              setAiLoading(false);
                              setAiInputImageDataUrl(null);
                            }
                          }}
                        >
                          <div className="flex flex-1 flex-col gap-1">
                            <Textarea
                              value={aiInput}
                              onChange={(e) => setAiInput(e.target.value)}
                              placeholder="Сообщение"
                              className="min-h-[40px] max-h-24 min-w-0 flex-1 resize-none rounded-2xl border-0 bg-white px-4 py-2.5 text-[15px] shadow-sm focus-visible:ring-2"
                              disabled={aiLoading}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                                }
                              }}
                            />
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                {aiInputImageDataUrl ? "Вложено изображение" : "Можно прикрепить изображение"}
                              </span>
                              <Input
                                type="file"
                                accept="image/*"
                                className="h-8 max-w-[220px] cursor-pointer border-dashed text-xs"
                                disabled={aiLoading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) {
                                    setAiInputImageDataUrl(null);
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onerror = () => {
                                    setAiInputImageDataUrl(null);
                                    toast.error("Не удалось прочитать файл изображения");
                                  };
                                  reader.onload = () => {
                                    if (typeof reader.result === "string") {
                                      setAiInputImageDataUrl(reader.result);
                                    } else {
                                      setAiInputImageDataUrl(null);
                                      toast.error("Неверный формат файла изображения");
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </div>
                          </div>
                          <Button
                            type="submit"
                            disabled={aiLoading || (!aiInput.trim() && !aiInputImageDataUrl)}
                            className="h-10 w-10 shrink-0 rounded-full bg-[#25D366] p-0 text-white hover:bg-[#20BD5A]"
                            title="Отправить"
                          >
                            <span className="rotate-[-45deg] text-lg">➤</span>
                      </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="testimonials" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Добавить отзыв</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="test_author">Имя автора</Label>
                  <Input
                    id="test_author"
                    value={testimonialForm.author_name}
                    onChange={(e) => setTestimonialForm((f) => ({ ...f, author_name: e.target.value }))}
                    placeholder="Иван П."
                  />
                </div>
                <div>
                  <Label htmlFor="test_text">Текст отзыва</Label>
                  <Textarea
                    id="test_text"
                    value={testimonialForm.text}
                    onChange={(e) => setTestimonialForm((f) => ({ ...f, text: e.target.value }))}
                    placeholder="Отличный сервис, всё понравилось!"
                    className="min-h-[80px]"
                  />
                </div>
                <Button onClick={handleCreateTestimonial} disabled={testimonialSaving}>
                  {testimonialSaving ? "Сохранение…" : "Добавить отзыв"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Список отзывов</h2>
                <p className="text-sm text-muted-foreground">
                  Включите «Показать», чтобы отзыв отображался на главной странице.
                </p>
              </CardHeader>
              <CardContent>
                {testimonials.length > 0 ? (
                  <div className="space-y-3">
                    {testimonials.map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{t.author_name ?? "—"}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{t.text ?? ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={t.is_active}
                              onChange={(e) => handleToggleTestimonial(t.id, e.target.checked)}
                              className="h-4 w-4 rounded border-zinc-300"
                            />
                            <span className="text-sm">Показать</span>
                          </label>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteTestimonial(t.id)}>
                            Удалить
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">Нет отзывов</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tests" className="space-y-6">
            <AdminTestCatalogTab />
          </TabsContent>

          <TabsContent value="cache" className="space-y-6">
            <AgentCacheBrowser />
          </TabsContent>

          <TabsContent value="deploy" className="space-y-6">
            <DeployTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
