"use client";

import Link from "next/link";
import { useAuth } from "komiss/components/auth-provider";
import { Card, CardContent, CardHeader } from "komiss/components/ui/card";

export default function ClaudeSetupPage() {
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
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="mb-4 inline-block text-sm text-primary hover:underline">
          ← Назад в админку
        </Link>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-semibold">Подключение Claude Sonnet 4.6 через OpenRouter</h1>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-4">
            <h2>1. Получите API-ключ OpenRouter</h2>
            <ul>
              <li>Зарегистрируйтесь на <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" className="text-primary underline">OpenRouter</a></li>
              <li>Перейдите в <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">Keys</a></li>
              <li>Создайте новый ключ и скопируйте его</li>
            </ul>

            <h2>2. Добавьте ключ в .env</h2>
            <p>В корне проекта откройте файл <code>.env</code> и добавьте:</p>
            <pre className="rounded bg-zinc-100 p-3 text-sm">AGENT_OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx</pre>
            <p>(подставьте ваш ключ вместо sk-or-v1-...)</p>

            <h2>3. Перезапустите приложение</h2>
            <p>После сохранения .env перезапустите: Next.js, агент (npm run agent:serve) и Telegram-бот.</p>

            <h2>4. Выберите Claude в админке</h2>
            <p>Вкладка «Комиссионка AI» → выпадающий список «Модель» → Claude Sonnet 4.6.</p>

            <h2>Стоимость</h2>
            <p>OpenRouter взимает плату. Claude Sonnet 4.6: ~$3/M токенов (ввод), ~$15/M токенов (вывод). <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-primary underline">Подробнее</a></p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
