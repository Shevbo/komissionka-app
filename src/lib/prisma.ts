import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env or .env.local (e.g. postgresql://user:password@localhost:5432/komissionka)"
  );
}

const poolMax = parseInt(process.env.DB_POOL_MAX ?? "10", 10) || 10;
const poolIdleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT ?? "30000", 10) || 30000;

// Пул соединений для Prisma 7 (driver adapter)
const pool = new pg.Pool({
  connectionString,
  max: poolMax,
  idleTimeoutMillis: poolIdleTimeout,
});
const adapter = new PrismaPg(pool);

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter, // Это критически важно для Prisma 7 в режиме dev
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;