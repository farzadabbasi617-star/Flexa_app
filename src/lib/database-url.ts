/**
 * Read an env var at *runtime*. Dynamic key access (`env[name]`) prevents
 * Next.js/webpack from inlining the value during `next build`. If Render
 * does not expose DATABASE_URL at build time, a static `process.env.DATABASE_URL`
 * can be baked in as `undefined` forever — even when the runtime env is set.
 */
export function readRuntimeEnv(name: string): string | undefined {
  const env = process.env;
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readSecretFile(filePath: string): string | undefined {
  try {
    // Lazy require keeps this safe in edge/runtime bundles that cannot use fs.
    const fs = require("fs") as typeof import("fs");
    if (!fs.existsSync(filePath)) return undefined;
    const text = fs.readFileSync(filePath, "utf8").trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Render may mount a secret file instead of (or in addition to) an env var.
 * Also accept Neon/Vercel-style aliases so a pasted "POSTGRES_URL" still works.
 */
export function getRuntimeDatabaseUrl() {
  const fromEnv =
    readRuntimeEnv("DATABASE_URL") ||
    readRuntimeEnv("POSTGRES_URL") ||
    readRuntimeEnv("POSTGRES_PRISMA_URL") ||
    readRuntimeEnv("NEON_DATABASE_URL");

  if (fromEnv) return normalizeDatabaseUrl(fromEnv);

  const fromFile =
    readSecretFile("/etc/secrets/DATABASE_URL") ||
    readSecretFile("/etc/secrets/.env");

  if (!fromFile) return undefined;

  if (fromFile.includes("\n") || fromFile.includes("=")) {
    const match = fromFile.match(/^(?:export\s+)?DATABASE_URL\s*=\s*(.+)$/m);
    if (match) return normalizeDatabaseUrl(match[1]);
  }

  return normalizeDatabaseUrl(fromFile);
}

export function normalizeDatabaseUrl(rawUrl: string | undefined | null) {
  if (!rawUrl) return undefined;

  let url = rawUrl.trim();

  // Sometimes values are pasted as DATABASE_URL=... into a Render value field.
  if (url.startsWith("DATABASE_URL=")) {
    url = url.slice("DATABASE_URL=".length).trim();
  }

  // Remove wrapping quotes if they were pasted into the Render value field.
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }

  // Browser/Markdown copies may HTML-escape query separators.
  url = url.replaceAll("&amp;", "&");

  // `sslmode=require` currently verifies certificates in node-postgres, but its
  // announced future semantics are weaker. Normalize managed PostgreSQL URLs
  // to the explicit, future-proof verification mode. DB_SSL_NO_VERIFY remains
  // the deliberate escape hatch for a private host with a self-signed cert.
  url = url.replace(/([?&])sslmode=require(?=(&|$))/gi, "$1sslmode=verify-full");

  // Chat apps can turn password@host into markdown mailto links:
  // postgresql://user:[password@host](mailto:password@host)/db?... -> postgresql://user:password@host/db?...
  url = url.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)\[([^\]]+)\]\(mailto:[^)]+\)/i, "$1$2");

  return url;
}

export function isLikelyPostgresUrl(url: string | undefined) {
  return Boolean(url && /^postgres(?:ql)?:\/\//i.test(url));
}
