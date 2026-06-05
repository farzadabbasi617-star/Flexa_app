import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// Prevent build-time crashes when DATABASE_URL is missing
if (!databaseUrl && process.env.NODE_ENV !== "production") {
  console.warn("WARNING: DATABASE_URL is not defined. Database connections will fail.");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl || "postgresql://localhost:5432/dummy",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);


if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
