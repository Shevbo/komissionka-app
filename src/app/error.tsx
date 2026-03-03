"use client";

import { useEffect } from "react";
import { Button } from "komiss/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <h2 className="text-lg font-semibold text-foreground">Что-то пошло не так</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Не удалось загрузить данные. Проверьте подключение к базе данных и перезапустите страницу.
      </p>
      <Button onClick={reset} variant="outline">
        Попробовать снова
      </Button>
    </div>
  );
}
