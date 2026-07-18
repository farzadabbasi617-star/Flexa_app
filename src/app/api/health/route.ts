import { db } from "@/db";
import { isLikelyPostgresUrl, normalizeDatabaseUrl } from "@/lib/database-url";
import { sql } from "drizzle-orm";
import { getEmailDeliveryConfiguration } from "@/lib/email-service";
import { getClashRoyaleApiConfiguration } from "@/lib/clash-royale-api";
import { ensurePrivateTournamentAttendanceSchema } from "@/lib/private-tournament-attendance";

export const dynamic = "force-dynamic";

const release = (
  process.env.RENDER_GIT_COMMIT ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_VERSION ||
  "unknown"
).slice(0, 12);

const healthHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

function unhealthy(error: string) {
  return Response.json(
    { ok: false, database: false, release, error },
    { status: 500, headers: healthHeaders },
  );
}

export async function GET() {
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  const email = getEmailDeliveryConfiguration();
  const clashRoyaleApi = getClashRoyaleApiConfiguration();

  if (!databaseUrl) return unhealthy("DATABASE_URL_MISSING");
  if (!isLikelyPostgresUrl(databaseUrl)) return unhealthy("DATABASE_URL_INVALID_FORMAT");

  try {
    await ensurePrivateTournamentAttendanceSchema();
    await db.execute(sql`select 1`);
    return Response.json(
      {
        ok: true,
        database: true,
        release,
        clashRoyaleApi: {
          configured: clashRoyaleApi.configured,
          provider: clashRoyaleApi.provider,
        },
        telegramCron: {
          protected: Boolean(process.env.TELEGRAM_CRON_SECRET || process.env.CRON_SECRET),
        },
        email: {
          configured: email.configured,
          provider: email.provider,
          requestedProvider: email.requestedProvider,
          sandboxSender: email.sandboxSender,
          from: email.from,
          smtpHost: email.smtpHost,
          appsScriptConfigured: email.appsScriptConfigured,
        },
      },
      { headers: healthHeaders },
    );
  } catch {
    return unhealthy("DATABASE_CONNECTION_FAILED");
  }
}
