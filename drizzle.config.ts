import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * IMPORTANT: the database connection string is read from the DATABASE_URL
 * environment variable (see .env.example). Never hard-code credentials in
 * this file — it is committed to git.
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in your database connection string."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
