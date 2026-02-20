-- Таблица сообщений чата по товарам
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  author_name TEXT DEFAULT 'Гость',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_item_id ON public.messages(item_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- RLS: все могут читать и писать (для тестового режима)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read messages"
  ON public.messages FOR SELECT
  USING (true);

CREATE POLICY "Allow all insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (true);

-- Включаем Realtime для таблицы messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
