"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useAuth } from "komiss/components/auth-provider";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "komiss/components/ui/form";
import { Input } from "komiss/components/ui/input";
import { Textarea } from "komiss/components/ui/textarea";
import { Button } from "komiss/components/ui/button";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import Link from "next/link";

const formSchema = z.object({
  title: z.string().min(1, "Введите название"),
  description: z.string().default(""),
  price: z.coerce.number().min(0, "Цена не может быть отрицательной"),
  location: z.string().default(""),
});

interface FormValues {
  title: string;
  description: string;
  price: number;
  location: string;
}

export default function SellerPage() {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]); // Изменено на массив файлов
  const [imagePreviews, setImagePreviews] = useState<string[]>([]); // Для превью изображений
  const { user, setAuthDialogOpen } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      title: "",
      description: "",
      price: 0,
      location: "",
    },
  });

  async function onSubmit(values: FormValues) {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }

    setError(null);
    setSuccess(false);
    let imageUrls: string[] = [];

    try {
      if (imageFiles.length > 0) {
        const formData = new FormData();
        imageFiles.forEach((file) => {
          formData.append("files", file); // Добавляем каждый файл с именем "files"
        });

        const uploadRes = await fetch("/api/upload/item", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const d = await uploadRes.json().catch(() => ({}));
          setError(d.error ?? "Ошибка загрузки фото");
          return;
        }
        const uploadData = await uploadRes.json();
        imageUrls = uploadData.urls ?? []; // Ожидаем массив URL-адресов
      }

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          description: values.description || null,
          price: values.price,
          location: values.location || null,
          image_urls: imageUrls, // Отправляем массив URL-адресов
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Ошибка сохранения");
        return;
      }

      setSuccess(true);
      form.reset();
      setImageFiles([]);
      setImagePreviews([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setImageFiles(filesArray);

      const previews = filesArray.map((file) => URL.createObjectURL(file));
      setImagePreviews(previews);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-semibold">Публикация лота</h1>
            <p className="text-muted-foreground">
              Заполните данные о товаре для размещения на маркетплейсе
            </p>
          </CardHeader>
          <CardContent>
            {success && (
              <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                Лот опубликован
              </div>
            )}
            {error && (
              <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
                {error}
              </div>
            )}
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название товара</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Например: Винтажная куртка"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Описание</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Опишите состояние, особенности товара"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Цена (₽)</FormLabel>
                      <FormControl>
                        <Input
                          ref={field.ref}
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="0"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            field.onChange(val === "" ? 0 : Number(val));
                          }}
                          onBlur={field.onBlur}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Местоположение</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Город или район"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <FormLabel>Фото товара</FormLabel>
                  <Input
                    type="file"
                    accept="image/*"
                    multiple // Разрешаем выбор нескольких файлов
                    onChange={handleImageChange}
                    className="cursor-pointer"
                  />
                  {imagePreviews.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {imagePreviews.map((previewUrl, index) => (
                        <div key={index} className="relative h-24 w-24 rounded-md overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewUrl}
                            alt={`Превью ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  Опубликовать
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        <Link
          href="/"
          className="mt-6 inline-block text-primary underline hover:no-underline"
        >
          ← На главную
        </Link>
      </div>
    </div>
  );
}
