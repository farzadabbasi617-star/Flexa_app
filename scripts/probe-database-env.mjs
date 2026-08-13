/**
 * Runs *before* Next.js so we can see whether Render injected DATABASE_URL
 * into the process. Prints only presence/length — never the secret itself.
 */
const keys = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "NEON_DATABASE_URL"];
const report = {};
for (const key of keys) {
  const value = typeof process.env[key] === "string" ? process.env[key].trim() : "";
  report[key] = { present: value.length > 0, length: value.length };
}

let secretFile = false;
try {
  const fs = await import("node:fs");
  secretFile = fs.existsSync("/etc/secrets/DATABASE_URL") || fs.existsSync("/etc/secrets/.env");
} catch {
  secretFile = false;
}

console.log("[env-probe]", JSON.stringify({ ...report, secretFile, node: process.version }));
