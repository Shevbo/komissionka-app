"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { createBrowserClient } from "komiss/lib/supabase-browser";
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

const BUCKET = "item-photos";

export default function SellerPage() {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      title: "",
      description: "",
      price: 0,
      location: "",
    }, 
  });
   
  async function onSubmit(values: FormValues) {
    setError(null);
    setSuccess(false);

    const supabase = createBrowserClient();
    let publicUrl: string | null = null;

    try {
      // 1. Загружаем файл в бакет item-photos
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop() ?? "jpg";
        const filePath = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, imageFile, { upsert: false });

        if (uploadError) {
          console.log("[Ошибка загрузки в Storage]", uploadError);
          setError(`Ошибка загрузки: ${uploadError.message}`);
          return;
        }

        // 2. Получаем публичную ссылку
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
        publicUrl = data.publicUrl;
      }

      // 3. Вставляем запись в items
      const { error: insertError } = await supabase.from("items").insert({
        title: values.title,
        description: values.description || null,
        price: values.price,
        location: values.location || null,
        image_url: publicUrl,
        seller_id: null,
      });

      if (insertError) {
        console.log("[Ошибка вставки в items]", insertError);
        setError(`Ошибка сохранения: ${insertError.message}`);
        return;
      }

      setSuccess(true);
      form.reset();
      setImageFile(null);
    } catch (err) {
      console.log("[Непредвиденная ошибка]", err);
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    }
  }

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
                    onChange={(e) =>
                      setImageFile(e.target.files?.[0] ?? null)
                    }
                    className="cursor-pointer"
                  />
                  {imageFile && (
                    <p className="text-sm text-muted-foreground">
                      Выбран файл: {imageFile.name}
                    </p>
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
