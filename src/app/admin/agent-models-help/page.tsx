"use client";

import Link from "next/link";
import { useAuth } from "komiss/components/auth-provider";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";
import {
  GOOGLE_CHAT_MODELS,
  GOOGLE_MEDIA_MODELS,
  GOOGLE_OTHER_MODELS,
} from "komiss/lib/agent-models";
import { ImageIcon } from "lucide-react";

const MODEL_HELP: Record<
  string,
  { short: string; features: string[]; useCase: string; example: string }
> = {
  "gemini-2-flash": {
    short: "Быстрая мультимодальная модель для повседневных задач.",
    features: ["Текст, изображения, код", "Низкая задержка", "Function calling"],
    useCase: "Чат, быстрые ответы, простые задачи.",
    example: "Краткие консультации, проверка кода, ответы на вопросы.",
  },
  "gemini-2-flash-exp": {
    short: "Экспериментальная версия Flash с новыми возможностями.",
    features: ["Новейшие функции", "Может меняться"],
    useCase: "Тестирование новых возможностей.",
    example: "Попробовать функции до релиза в стабильной версии.",
  },
  "gemini-2-flash-lite": {
    short: "Облегчённая модель — максимум скорости и экономии.",
    features: ["Минимальная задержка", "Низкая стоимость", "Мультимодальный ввод"],
    useCase: "Высокочастотные запросы, мобильные приложения.",
    example: "Классификация, краткие ответы, обработка форм.",
  },
  "gemini-2-5-flash": {
    short: "Основная модель для чата: 1M токенов контекста, высокая скорость.",
    features: ["1M токенов ввода", "Быстрый ответ", "Функции и код"],
    useCase: "Чат с агентом, анализ длинных документов, повседневные задачи.",
    example: "Обсуждение кода, консультации, планирование.",
  },
  "gemini-2-5-flash-lite": {
    short: "Баланс скорости и стоимости в линейке 2.5.",
    features: ["Быстрая", "Дешёвая", "1M токенов"],
    useCase: "Массовые операции, боты, автоматизация.",
    example: "Автоответы, парсинг, batch-обработка.",
  },
  "gemini-2-5-pro": {
    short: "Продвинутая модель для сложных рассуждений.",
    features: ["Глубокий анализ", "Сложная логика", "Код, математика, STEM"],
    useCase: "Сложные задачи, рефакторинг, отладка, архитектура.",
    example: "Проектирование системы, объяснение сложного кода, поиск багов.",
  },
  "gemini-2-pro-exp": {
    short: "Экспериментальная Pro с расширенными возможностями.",
    features: ["Новейший Pro", "Экспериментально"],
    useCase: "Пилотные задачи, оценки новых фич.",
    example: "Проверка гипотез, A/B сравнение с Pro.",
  },
  "gemini-3-flash": {
    short: "Топовая быстрая модель поколения 3.",
    features: ["Высокая скорость", "Улучшенные рассуждения", "Мультимодальность"],
    useCase: "Чат, ассистенты, интерактивные приложения.",
    example: "Умный ассистент, поддержка, творческие задачи.",
  },
  "gemini-3-pro": {
    short: "Продвинутая модель поколения 3.",
    features: ["Глубокий reasoning", "Агентные сценарии", "Сложные задачи"],
    useCase: "Разработка, исследования, сложный анализ.",
    example: "Автономный агент, многошаговое планирование.",
  },
  "gemini-3-1-pro": {
    short: "Флагманская модель Google — максимальные возможности.",
    features: ["Топ reasoning", "Мультимодальность", "Генерация контента"],
    useCase: "Самые сложные задачи, исследования, креатив.",
    example: "Стратегия, глубокий анализ, написание и редактирование.",
  },
  "gemini-native-audio": {
    short: "Работа с аудио в реальном времени (диалог, речь).",
    features: ["Ввод/вывод аудио", "Реaltime", "Gemini Live API"],
    useCase: "Голосовые ассистенты, транскрипция, диалоги.",
    example: "Голосовой бот, разбор записей, озвучка.",
  },
  "gemini-tts": {
    short: "Text-to-Speech: озвучка текста голосом.",
    features: ["Озвучка текста", "Естественный голос"],
    useCase: "Аудиокниги, подкасты, озвучка интерфейсов.",
    example: "Озвучить статью, сгенерировать аудио-ответ.",
  },
  "gemini-pro-tts": {
    short: "Pro-версия TTS с улучшенным качеством.",
    features: ["Высокое качество голоса", "TTS"],
    useCase: "Профессиональная озвучка, презентации.",
    example: "Озвучка длинных текстов, многоязычность.",
  },
  "gemma-3-1b": {
    short: "Компактная открытая модель для устройств с ограничениями.",
    features: ["1B параметров", "Локальное развёртывание", "Edge"],
    useCase: "Мобильные устройства, IoT, офлайн-сценарии.",
    example: "Простой чат-бот на устройстве.",
  },
  "gemma-3-2b": {
    short: "Лёгкая модель с балансом качества и размера.",
    features: ["2B параметров", "Быстрая", "Малый footprint"],
    useCase: "Встраиваемые приложения, быстрый inference.",
    example: "Классификация, краткие ответы на устройстве.",
  },
  "gemma-3-4b": {
    short: "Средний размер — хорошее качество при умеренных ресурсах.",
    features: ["4B параметров", "Текст и код"],
    useCase: "Локальные ассистенты, разработка.",
    example: "Помощь в коде, summarization.",
  },
  "gemma-3-12b": {
    short: "Более мощная модель Gemma для сложных задач.",
    features: ["12B параметров", "Улучшенное качество"],
    useCase: "Серверные приложения, сложные диалоги.",
    example: "Консультации, генерация контента.",
  },
  "gemma-3-27b": {
    short: "Максимальная модель Gemma по качеству.",
    features: ["27B параметров", "Близко к большим моделям"],
    useCase: "Сложные задачи без облачного Gemini.",
    example: "Анализ, творчество, многошаговые рассуждения.",
  },
  "imagen-4-fast": {
    short: "Быстрая генерация изображений по тексту.",
    features: ["Текст → изображение", "Низкая задержка", "Фотореализм"],
    useCase: "Иллюстрации, баннеры, визуальный контент.",
    example: "«Нарисуй логотип для кофейни» — получить картинку.",
  },
  "imagen-4": {
    short: "Основная модель генерации изображений Imagen 4.",
    features: ["Текст → изображение", "Высокое качество", "Стилизация"],
    useCase: "Маркетинг, дизайн, креатив.",
    example: "Генерация обложек, креативы для соцсетей.",
  },
  "imagen-4-ultra": {
    short: "Максимальное качество генерации изображений.",
    features: ["Топ качество", "Детализация", "Сложные сцены"],
    useCase: "Профессиональный дизайн, арт.",
    example: "Сложные композиции, фотореалистичные сцены.",
  },
  "nano-banana": {
    short: "Генерация изображений через Gemini 2.5 Flash.",
    features: ["Gemini + Imagen", "Текст → изображение"],
    useCase: "Интеграция генерации в чат с Gemini.",
    example: "В одном диалоге: обсудить и сгенерировать картинку.",
  },
  "nano-banana-pro": {
    short: "Генерация изображений через Gemini 3 Pro.",
    features: ["Gemini 3 Pro + Imagen", "Топ качество"],
    useCase: "Сложные визуальные запросы в контексте чата.",
    example: "Создать серию иллюстраций по сценарию.",
  },
  "veo-3": {
    short: "Генерация видео по тексту или изображению.",
    features: ["Текст/картинка → видео", "Синхронный звук", "Кинематографичное качество"],
    useCase: "Рекламные ролики, контент для соцсетей.",
    example: "«Кот идёт по улице» — короткое видео.",
  },
  "veo-3-fast": {
    short: "Быстрая генерация видео.",
    features: ["Меньшая задержка", "Текст → видео"],
    useCase: "Прототипы, превью, массовый контент.",
    example: "Быстрые видео-заставки, превью.",
  },
  "gemini-embedding": {
    short: "Преобразование текста в числовые векторы для поиска и кластеризации.",
    features: ["Эмбеддинги", "Semantic search", "RAG"],
    useCase: "Поиск по смыслу, рекомендации, RAG-системы.",
    example: "Найти похожие документы, семантический поиск.",
  },
};

function ModelCard({
  model,
  help,
}: {
  model: { id: string; name: string; helpKey?: string; multimodal?: boolean };
  help?: (typeof MODEL_HELP)[string];
}) {
  const key = model.helpKey ?? model.id;
  const h = help ?? MODEL_HELP[key];
  if (!h) return null;
  return (
    <Card id={key} className="scroll-mt-24">
      <CardHeader className="pb-2">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold">
          {model.name}
          {model.multimodal && <span title="Мультимодальная"><ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" /></span>}
        </h2>
        <p className="text-sm text-muted-foreground">{model.id}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{h.short}</p>
        <div>
          <p className="font-medium text-muted-foreground">Особенности:</p>
          <ul className="list-inside list-disc">
            {h.features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium text-muted-foreground">Рекомендуется для:</p>
          <p>{h.useCase}</p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground">Пример:</p>
          <p className="text-muted-foreground">{h.example}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentModelsHelpPage() {
  const { userRole, loading } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center">Загрузка…</div>;
  if (userRole !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Доступ только для администраторов.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="mb-4 inline-block text-sm text-primary hover:underline">
          ← Назад в админку
        </Link>
        <Card className="mb-8">
          <CardHeader>
            <h1 className="text-2xl font-semibold">Справка по моделям Google AI Pro</h1>
            <p className="text-muted-foreground">
              Модели из подписки Google AI Pro. Gemini 3 Flash и Gemini 2.5 Flash — только текст, картинки не генерируют.
              Для генерации изображений в чате выберите <strong>Nano Banana</strong> или <strong>Nano Banana Pro</strong>.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4 shrink-0" /> = мультимодальная (ввод/вывод изображений)
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong>Мультимодальный вывод:</strong> когда модель возвращает изображения (inlineData), агент встраивает их в ответ. 
              В чате отображаются картинки, сгенерированные моделями с поддержкой image output. Видео пока обрабатываются отдельными API (Veo).
            </p>
          </CardHeader>
        </Card>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Модели для чата (агент)</h2>
          <div className="space-y-4">
            {GOOGLE_CHAT_MODELS.map((m) => (
              <ModelCard key={m.id} model={m} help={MODEL_HELP[m.helpKey ?? ""]} />
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Генерация изображений и видео</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Эти модели используют отдельные API (Imagen, Veo). В текущем чате агента не выбираются — их подключают
            отдельно для сценариев генерации медиа.
          </p>
          <div className="space-y-4">
            {GOOGLE_MEDIA_MODELS.map((m) => (
              <ModelCard key={m.id} model={m} help={MODEL_HELP[m.helpKey ?? ""]} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Эмбеддинги и прочее</h2>
          <div className="space-y-4">
            {GOOGLE_OTHER_MODELS.map((m) => (
              <ModelCard key={m.id} model={m} help={MODEL_HELP[m.helpKey ?? ""]} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
