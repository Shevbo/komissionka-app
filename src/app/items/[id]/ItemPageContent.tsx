"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "komiss/components/ui/card";
import { ItemChat } from "komiss/components/item-chat";
import { useEffect, useState } from "react";
import { useAuth } from "komiss/components/auth-provider";
import { Button } from "komiss/components/ui/button";
import { Input } from "komiss/components/ui/input";
import { Textarea } from "komiss/components/ui/textarea";
import { ChevronLeft, ChevronRight, Trash2, X, XCircle } from "lucide-react";
import { PLACEHOLDER_DATA_URI } from "komiss/lib/placeholder";

export type ItemPageContentItem = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price: unknown;
  location: string | null;
  image_url: string | null;
  image_urls: string[];
  status: string;
  is_auction: boolean | null;
  sale_price: unknown;
  profiles: { full_name: string | null } | null;
};

type ItemPageContentProps = {
  item: ItemPageContentItem;
  itemId: string;
};

export function ItemPageContent({ item, itemId }: ItemPageContentProps) {
  const router = useRouter();
  const { user, userRole } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title ?? "");
  const [editDescription, setEditDescription] = useState(item.description ?? "");
  const [editPrice, setEditPrice] = useState(Number(item.price ?? 0));
  const [editLocation, setEditLocation] = useState(item.location ?? "");
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>(item.image_urls || []);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [mainImage, setMainImage] = useState(item.image_urls?.[0] || null);
  const [mainImageError, setMainImageError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = user?.id === item.seller_id;
  const canEdit = userRole === "admin" || isAuthor;

  const formatPrice = (price: number | null) =>
    price != null ? `${Number(price).toLocaleString("ru-RU")} ₽` : "—";

  const salePrice = item.sale_price != null ? Number(item.sale_price) : null;
  const isAuction = item.is_auction ?? false;

  const handleNewImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setNewImageFiles((prev) => [...prev, ...filesArray]);

      const previews = filesArray.map((file) => URL.createObjectURL(file));
      setNewImagePreviews((prev) => [...prev, ...previews]);
    }
  };

  const handleRemoveExistingImage = (urlToRemove: string) => {
    setCurrentImageUrls((prev) => {
      const next = prev.filter((url) => url !== urlToRemove);
      if (mainImage === urlToRemove) {
        setMainImage(next[0] || null);
      }
      return next;
    });
  };

  const handleRemoveNewImage = (previewUrlToRemove: string) => {
    const index = newImagePreviews.indexOf(previewUrlToRemove);
    if (index > -1) {
      setNewImagePreviews((prev) => prev.filter((_, i) => i !== index));
      setNewImageFiles((prev) => prev.filter((_, i) => i !== index));
      URL.revokeObjectURL(previewUrlToRemove);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    let uploadedImageUrls: string[] = [];

    try {
      if (newImageFiles.length > 0) {
        const formData = new FormData();
        newImageFiles.forEach((file) => {
          formData.append("files", file);
        });

        const uploadRes = await fetch("/api/upload/item", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const d = await uploadRes.json().catch(() => ({}));
          throw new Error(d.error ?? "Ошибка загрузки новых фото");
        }
        const uploadData = await uploadRes.json();
        uploadedImageUrls = uploadData.urls ?? [];
      }

      const updatedImageUrls = [...currentImageUrls, ...uploadedImageUrls];

      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          price: editPrice,
          location: editLocation,
          image_urls: updatedImageUrls,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Ошибка сохранения изменений");
      }

      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!canEdit || !isEditing) return;
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/items/${itemId}/generate-image`, {
        method: "POST",
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Не удалось сгенерировать иллюстрацию");
      }

      const data = await res.json();
      const urls = Array.isArray(data.image_urls) ? data.image_urls as string[] : [];

      if (urls.length > 0) {
        setCurrentImageUrls(urls);
        setMainImage(urls[urls.length - 1]);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Произошла ошибка при генерации иллюстрации"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditTitle(item.title ?? "");
    setEditDescription(item.description ?? "");
    setEditPrice(Number(item.price ?? 0));
    setEditLocation(item.location ?? "");
    setCurrentImageUrls(item.image_urls || []);
    setMainImage(item.image_urls?.[0] || null);
    setNewImageFiles([]);
    setNewImagePreviews([]);
    setError(null);
    newImagePreviews.forEach(URL.revokeObjectURL);
  };

  const handleDelete = async () => {
    if (!canEdit || !window.confirm("Удалить товар? Это действие нельзя отменить.")) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Ошибка удаления");
      }
      router.push("/seller");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось удалить товар");
    } finally {
      setIsDeleting(false);
    }
  };

  const displayImageUrls = isEditing ? [...currentImageUrls, ...newImagePreviews] : (item.image_urls || []);
  const currentMainImage = mainImage || displayImageUrls[0] || null;

  const currentIdx = currentMainImage ? displayImageUrls.indexOf(currentMainImage) : -1;
  const canGoPrev = displayImageUrls.length > 1;
  const canGoNext = displayImageUrls.length > 1;

  const goPrev = () => {
    if (!canGoPrev) return;
    const newIdx = currentIdx <= 0 ? displayImageUrls.length - 1 : currentIdx - 1;
    setMainImage(displayImageUrls[newIdx]);
  };

  const goNext = () => {
    if (!canGoNext) return;
    const newIdx = (currentIdx + 1) % displayImageUrls.length;
    setMainImage(displayImageUrls[newIdx]);
  };

  const openLightbox = () => {
    if (currentMainImage) setLightboxOpen(true);
  };

  useEffect(() => {
    setMainImageError(false);
  }, [currentMainImage]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen]);

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-6 inline-flex text-muted-foreground hover:text-foreground"
        >
          ← Назад к каталогу
        </Link>

        {canEdit && !isEditing && (
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setIsEditing(true)}>Изменить</Button>
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {currentMainImage && !mainImageError ? (
                  <>
                    <button
                      type="button"
                      onClick={openLightbox}
                      className="absolute inset-0 z-0 flex h-full w-full cursor-zoom-in items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      aria-label="Увеличить фото"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentMainImage}
                        alt={editTitle || "Фото товара"}
                        className="h-full w-full object-cover"
                        onError={() => setMainImageError(true)}
                      />
                    </button>
                    {canGoPrev && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          goPrev();
                        }}
                        className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                        aria-label="Предыдущее фото"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </button>
                    )}
                    {canGoNext && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          goNext();
                        }}
                        className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
                        aria-label="Следующее фото"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </button>
                    )}
                  </>
                ) : (
                  <img
                    src={PLACEHOLDER_DATA_URI}
                    alt="Нет фото"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              {displayImageUrls && displayImageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 overflow-x-auto">
                  {displayImageUrls.map((url, index) => (
                    <button
                      type="button"
                      key={url}
                      className={`relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 ${url === currentMainImage ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/30"}`}
                      onClick={() => setMainImage(url)}
                      aria-label={`Фото ${index + 1}`}
                      aria-pressed={url === currentMainImage}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Миниатюра ${index + 1}`}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = PLACEHOLDER_DATA_URI;
                        }}
                      />
                      {isEditing && (
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (currentImageUrls.includes(url)) {
                              handleRemoveExistingImage(url);
                            } else {
                              handleRemoveNewImage(url);
                            }
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {isEditing && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Добавить новые фото</h3>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateImage}
                    disabled={loading || isGenerating}
                    className="w-full sm:w-auto"
                  >
                    {isGenerating ? "Генерация иллюстрации..." : "Сгенерировать новую иллюстрацию"}
                  </Button>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">или загрузить с устройства</label>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleNewImageChange}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col p-6 md:p-8">
              {error && (
                <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-medium text-white">
                  Активно
                </span>
                {isAuction && (
                  <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">
                    АУКЦИОН
                  </span>
                )}
              </div>
              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-2xl font-bold md:text-3xl"
                />
              ) : (
                <h1 className="text-2xl font-bold md:text-3xl">{item.title}</h1>
              )}

              <div className="mt-6 space-y-4">
                {item.profiles?.full_name && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Продавец:</span>{" "}
                    {item.profiles.full_name}
                  </p>
                )}
                <div className="flex items-baseline gap-3">
                  {salePrice != null ? (
                    <>
                      <span className="text-lg text-muted-foreground line-through">
                        {formatPrice(Number(item.price))}
                      </span>
                      <span className="text-2xl font-bold text-orange-600">
                        {formatPrice(salePrice)}
                      </span>
                    </>
                  ) : (
                    isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={editPrice}
                        onChange={(e) => setEditPrice(Number(e.target.value))}
                        className="text-2xl font-bold text-primary"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-primary">
                        {formatPrice(Number(item.price))}
                      </span>
                    )
                  )}
                </div>

                {isEditing ? (
                  <Input
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Местоположение"
                  />
                ) : (
                  item.location && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Местоположение:</span>{" "}
                      {item.location}
                    </p>
                  )
                )}

                <div>
                  <h3 className="mb-2 font-semibold">Описание</h3>
                  {isEditing ? (
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Опишите состояние, особенности товара"
                      className="min-h-[100px]"
                    />
                  ) : (
                    item.description && (
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {item.description}
                      </p>
                    )
                  )}
                </div>

                {isEditing && (
                  <div className="flex flex-wrap gap-4">
                    <Button onClick={handleSave} disabled={loading || isDeleting}>
                      {loading ? "Сохранение..." : "Сохранить"}
                    </Button>
                    <Button variant="outline" onClick={handleCancel} disabled={loading || isDeleting}>
                      Отмена
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={loading || isDeleting}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeleting ? "Удаление..." : "Удалить товар"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <section className="mt-10">
          <ItemChat itemId={itemId} />
        </section>

        {/* Лайтбокс при клике на фото */}
        {lightboxOpen && currentMainImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightboxOpen(false)}
            aria-label="Нажмите для закрытия"
          >
            <div
              className="relative max-h-[90vh] max-w-[90vw]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentMainImage}
                alt={editTitle || "Фото товара"}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              />
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:bg-gray-100"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
              {canGoPrev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition hover:bg-white"
                  aria-label="Предыдущее фото"
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
              )}
              {canGoNext && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition hover:bg-white"
                  aria-label="Следующее фото"
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
