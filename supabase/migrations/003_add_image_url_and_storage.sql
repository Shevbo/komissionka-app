-- Добавляем колонку image_url в таблицу items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Создаём bucket для изображений товаров (если ещё не существует)
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-photos', 'item-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Политики Storage: разрешаем анонимную загрузку и чтение
CREATE POLICY "Allow public read item photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'item-photos');

CREATE POLICY "Allow anon upload item photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'item-photos');
