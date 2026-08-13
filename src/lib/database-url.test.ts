import { describe, expect, it } from "vitest";
import { getRuntimeDatabaseUrl, isLikelyPostgresUrl, normalizeDatabaseUrl, readRuntimeEnv } from "@/lib/database-url";

describe("database URL normalization", () => {
  it("upgrades sslmode=require to explicit certificate verification", () => {
    expect(normalizeDatabaseUrl("postgresql://user:pass@host/db?sslmode=require"))
      .toBe("postgresql://user:pass@host/db?sslmode=verify-full");
    expect(normalizeDatabaseUrl("postgres://user:pass@host/db?pool=5&sslmode=REQUIRE"))
      .toBe("postgres://user:pass@host/db?pool=5&sslmode=verify-full");
  });

  it("cleans common dashboard paste artifacts", () => {
    expect(normalizeDatabaseUrl("  DATABASE_URL='postgresql://user:pass@host/db?x=1&amp;sslmode=require'  "))
      .toBe("postgresql://user:pass@host/db?x=1&sslmode=verify-full");
  });

  it("reads DATABASE_URL dynamically from the runtime environment", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:pass@host/db?sslmode=require";
    expect(readRuntimeEnv("DATABASE_URL")).toBe("postgresql://user:pass@host/db?sslmode=require");
    expect(getRuntimeDatabaseUrl()).toBe("postgresql://user:pass@host/db?sslmode=verify-full");
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  it("validates supported PostgreSQL schemes", () => {
    expect(isLikelyPostgresUrl("postgresql://host/db")).toBe(true);
    expect(isLikelyPostgresUrl("postgres://host/db")).toBe(true);
    expect(isLikelyPostgresUrl("https://host/db")).toBe(false);
    expect(isLikelyPostgresUrl(undefined)).toBe(false);
  });
});
