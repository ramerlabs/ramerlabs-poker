import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Neon HTTP driver for Vercel serverless — avoids Prisma's TCP connection pool
 * (P2024) that was starving login while room polls held connections.
 */
function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  // HTTP driver (not TCP pool) — required 2nd arg is neon query options
  const adapter = new PrismaNeonHttp(url, { arrayMode: false, fullResults: true });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

// Reuse across warm serverless isolates
globalForPrisma.prisma = prisma;
