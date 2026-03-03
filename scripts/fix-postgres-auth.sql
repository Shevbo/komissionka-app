-- Fix PostgreSQL auth for Komissionka on Hoster
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komissionka') THEN
    CREATE USER komissionka WITH PASSWORD '123';
  ELSE
    ALTER USER komissionka WITH PASSWORD '123';
  END IF;
END $$;
CREATE DATABASE komissionka_db OWNER komissionka;
GRANT ALL PRIVILEGES ON DATABASE komissionka_db TO komissionka;
