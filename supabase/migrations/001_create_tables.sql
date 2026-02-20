-- Таблица profiles (профили покупателей/продавцов)
-- Связь с auth.users через id
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  contacts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индекс для поиска по дате регистрации
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);

-- RLS для profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Владелец может читать и редактировать свой профиль
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Триггер для автоматического создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, contacts)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Отвязываем триггер если существует (для повторного запуска)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Таблица items (товары)
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(12, 2) NOT NULL CHECK (price >= 0),
  location TEXT,
  delivery_terms TEXT,
  seller_contacts TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  media_urls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Комментарии для media_urls: массив объектов [{type: 'photo'|'video', url: string}, ...]
-- Пример: [{"type": "photo", "url": "https://..."}, {"type": "video", "url": "https://..."}]

CREATE INDEX IF NOT EXISTS idx_items_seller_id ON public.items(seller_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON public.items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_price ON public.items(price);

-- RLS для items
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Все могут просматривать активные товары
CREATE POLICY "Anyone can view active items"
  ON public.items FOR SELECT
  USING (status = 'active');

-- Владельцы могут просматривать свои товары (включая архивные)
CREATE POLICY "Sellers can view own items"
  ON public.items FOR SELECT
  USING (auth.uid() = seller_id);

-- Только владелец может создавать свои товары
CREATE POLICY "Sellers can insert own items"
  ON public.items FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- Только владелец может редактировать свои товары
CREATE POLICY "Sellers can update own items"
  ON public.items FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- Только владелец может удалять свои товары
CREATE POLICY "Sellers can delete own items"
  ON public.items FOR DELETE
  USING (auth.uid() = seller_id);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_updated_at ON public.items;
CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
