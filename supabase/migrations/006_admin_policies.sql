-- Политики для админ-панели: просмотр всех товаров и удаление
-- Внимание: для production нужна проверка роли администратора

CREATE POLICY "Allow all read items for admin"
  ON public.items FOR SELECT
  USING (true);

CREATE POLICY "Allow all delete items for admin"
  ON public.items FOR DELETE
  USING (true);
