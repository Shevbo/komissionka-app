-- Добавляем колонки is_auction и sale_price в items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS is_auction BOOLEAN DEFAULT false;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS sale_price DECIMAL(12, 2) CHECK (sale_price >= 0);
