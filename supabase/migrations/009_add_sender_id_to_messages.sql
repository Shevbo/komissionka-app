-- Добавляем sender_id в messages для RLS
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

-- Обновляем RLS: только авторизованные могут писать
DROP POLICY IF EXISTS "Allow all insert messages" ON public.messages;
CREATE POLICY "Authenticated users can insert messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);
