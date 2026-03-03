-- Обеспечить, что пользователь с email bshevelev@mail.ru имеет профиль с ролью admin.
WITH u AS (
  SELECT id, email
  FROM users
  WHERE LOWER(email) = LOWER('bshevelev@mail.ru')
  LIMIT 1
)
INSERT INTO profiles (id, email, role, created_at)
SELECT u.id, COALESCE(u.email, 'bshevelev@mail.ru'), 'admin', NOW()
FROM u
ON CONFLICT (id) DO UPDATE
SET role = 'admin',
    email = EXCLUDED.email;

