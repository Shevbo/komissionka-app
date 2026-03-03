// prisma.config.ts
import { defineConfig } from '@prisma/config'
import * as dotenv from 'dotenv'

// Явно загружаем переменные из .env
dotenv.config()

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
})