-- Тестовая миграция: позволяет вставлять товары без авторизации.
-- Временно разрешаем seller_id = NULL и анонимную вставку для проверки записи.

-- Делаем seller_id nullable и снимаем FK (временно, для теста)
ALTER TABLE public.items
  ALTER COLUMN seller_id DROP NOT NULL;

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_seller_id_fkey;

-- Разрешаем анонимную вставку
CREATE POLICY "Allow anon test insert"
  ON public.items FOR INSERT
  WITH CHECK (true);
