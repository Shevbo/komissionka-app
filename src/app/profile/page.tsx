"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "komiss/components/auth-provider";
import { Button } from "komiss/components/ui/button";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import { Input } from "komiss/components/ui/input";
import { Textarea } from "komiss/components/ui/textarea";
import { Checkbox } from "komiss/components/ui/checkbox";
import { trackActivity } from "komiss/lib/activity";

type ProfileResponse = {
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  telegram_id?: string | null;
  telegram_username?: string | null;
  phone?: string | null;
  preferred_location?: string | null;
  email_notifications_enabled?: boolean | null;
  email?: string | null;
  created_at?: string | null;
  profile_number?: number | null;
} | null;

export default function ProfilePage() {
  const { user, loading: authLoading, signOut, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileResponse>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/profile", { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Не удалось загрузить профиль");
        }
        const data = (await res.json()) as { profile: ProfileResponse };
        if (cancelled) return;
        const p = data.profile;
        setProfile(p);
        setFullName(p?.full_name ?? "");
        setPhone(p?.phone ?? "");
        setEmail(p?.email ?? (user.email ?? ""));
        setPreferredLocation(p?.preferred_location ?? "");
        setEmailNotifications(
          p?.email_notifications_enabled ?? true
        );
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Неизвестная ошибка при загрузке профиля"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="text-xl font-semibold">Личный кабинет</h1>
            <p className="text-sm text-muted-foreground">
              Для доступа к личному кабинету нужно войти в систему.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/signup">Зарегистрироваться</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const createdAtText =
    profile?.created_at &&
    new Date(profile.created_at).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        full_name: fullName,
        phone,
        email,
        preferred_location: preferredLocation,
        email_notifications_enabled: emailNotifications,
      };

      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось сохранить изменения");
      }

      setProfile(data.profile ?? null);
      setSuccess("Профиль обновлён");
      await refreshProfile();
      try {
        await trackActivity("settings_save", { entity: "profile" });
      } catch {
        // ignore tracking errors
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Неизвестная ошибка при сохранении"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    const confirmed = window.confirm(
      "Удалить профиль и все связанные данные (товары, сообщения, корзину)? Это действие необратимо."
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось удалить профиль");
      }
      await signOut();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Неизвестная ошибка при удалении"
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-white">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Личный кабинет</h1>
            <p className="text-sm text-muted-foreground">
              Управление вашими данными и просмотр статистики профиля.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/">На главную</Link>
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Мои данные</h2>
              <p className="text-sm text-muted-foreground">
                Эти данные используются для связи и подбора удобных точек
                получения заказов.
              </p>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                  {success}
                </div>
              )}
              {loading ? (
                <div className="space-y-3">
                  <div className="h-9 w-1/2 animate-pulse rounded-md bg-muted" />
                  <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                  <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                  <div className="h-24 w-full animate-pulse rounded-md bg-muted" />
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label
                      htmlFor="fullName"
                      className="mb-2 block text-sm font-medium"
                    >
                      ФИО
                    </label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Иван Иванов"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-medium"
                    >
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-2 block text-sm font-medium"
                    >
                      Телефон
                    </label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+7"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="preferredLocation"
                      className="mb-2 block text-sm font-medium"
                    >
                      Предпочтительный адрес поиска / удобный адрес пункта
                      выдачи СДЭК / Ozon
                    </label>
                    <Textarea
                      id="preferredLocation"
                      value={preferredLocation}
                      onChange={(e) => setPreferredLocation(e.target.value)}
                      placeholder="Город, район, ближайший к вам адрес или ориентир для выбора ПВЗ"
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="emailNotifications"
                      checked={emailNotifications}
                      onCheckedChange={(v) =>
                        setEmailNotifications(v === true)
                      }
                    />
                    <label
                      htmlFor="emailNotifications"
                      className="text-sm text-muted-foreground"
                    >
                      Получать уведомления на email
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Сохранение..." : "Сохранить изменения"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving || loading}
                      onClick={() => {
                        if (!profile) return;
                        setFullName(profile.full_name ?? "");
                        setPhone(profile.phone ?? "");
                        setEmail(
                          profile.email ?? user?.email ?? ""
                        );
                        setPreferredLocation(
                          profile.preferred_location ?? ""
                        );
                        setEmailNotifications(
                          profile.email_notifications_enabled ?? true
                        );
                        setError(null);
                        setSuccess(null);
                      }}
                    >
                      Отменить изменения
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Информация профиля</h2>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Дата регистрации
                  </span>
                  <span>{createdAtText ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Номер профиля
                  </span>
                  <span>{profile?.profile_number ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Роль в системе
                  </span>
                  <span>{profile?.role ?? "Пользователь"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">История заказов</h2>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  История заказов появится здесь, когда будет запущен модуль
                  оформления заказов.
                </p>
                <p>Сейчас вы можете добавлять товары в корзину и следить за предложениями.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Отзывы и рейтинг</h2>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  В дальнейшем здесь будет отображаться рейтинг по отзывам,
                  отзывы о вас и ваши собственные отзывы.
                </p>
                <p>
                  Раздел находится в разработке. Текущие общие отзывы можно
                  посмотреть на главной странице.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-destructive">
                  Опасная зона
                </h2>
                <p className="text-sm text-muted-foreground">
                  Полное удаление профиля и связанных данных.
                </p>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Удаление..." : "Удалить профиль"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

