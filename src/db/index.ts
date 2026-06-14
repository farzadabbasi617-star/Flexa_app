import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isLikelyPostgresUrl, normalizeDatabaseUrl } from "@/lib/database-url";

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

if (!databaseUrl) {
  console.error("CRITICAL ERROR: DATABASE_URL is missing in environment variables!");
} else if (!isLikelyPostgresUrl(databaseUrl)) {
  console.error("CRITICAL ERROR: DATABASE_URL must start with postgresql://");
}

/**
 * SSL configuration.
 *
 * Neon (and most managed Postgres) present certificates signed by a real CA,
 * so certificate verification SHOULD stay on. Disabling it (rejectUnauthorized
 * = false) opens the connection to man-in-the-middle attacks.
 *
 * If a specific host genuinely needs a relaxed check, opt out explicitly by
 * setting DB_SSL_NO_VERIFY="true" — but treat that as a last resort.
 */
const noVerify = process.env.DB_SSL_NO_VERIFY === "true";

const globalForDb = globalThis as typeof globalThis & {
  __flexaPool?: Pool;
};

export const pool =
  globalForDb.__flexaPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: !noVerify },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__flexaPool = pool;
}

export const db = drizzle(pool);
