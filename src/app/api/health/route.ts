import { db } from "@/db";
import { isLikelyPostgresUrl, normalizeDatabaseUrl } from "@/lib/database-url";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

  if (!databaseUrl) {
    return Response.json(
      { ok: false, database: false, error: "DATABASE_URL_MISSING" },
      { status: 500 }
    );
  }

  if (!isLikelyPostgresUrl(databaseUrl)) {
    return Response.json(
      { ok: false, database: false, error: "DATABASE_URL_INVALID_FORMAT" },
      { status: 500 }
    );
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: true });
  } catch {
    return Response.json(
      { ok: false, database: false, error: "DATABASE_CONNECTION_FAILED" },
      { status: 500 }
    );
  }
}
