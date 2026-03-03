-- Insert demo news if table is empty
INSERT INTO "news" ("id", "title", "body", "is_published", "created_at")
SELECT gen_random_uuid(), 'Добро пожаловать на Комиссионку!', 'Здесь вы можете продавать и покупать вещи. Регистрируйтесь и начинайте торговать.', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "news" LIMIT 1);

-- Insert demo testimonial if table is empty
INSERT INTO "testimonials" ("id", "author_name", "text", "is_active", "created_at")
SELECT gen_random_uuid(), 'Мария', 'Отличный сервис! Продала несколько вещей за неделю.', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "testimonials" LIMIT 1);
