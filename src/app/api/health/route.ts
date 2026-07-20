import { db } from "@/db";
import { isLikelyPostgresUrl, normalizeDatabaseUrl } from "@/lib/database-url";
import { sql } from "drizzle-orm";
import { getEmailDeliveryConfiguration } from "@/lib/email-service";
import { getClashRoyaleApiConfiguration } from "@/lib/clash-royale-api";
import { ensurePrivateTournamentAttendanceSchema } from "@/lib/private-tournament-attendance";
import { ensureStoreOrderLifecycleSchema } from "@/lib/store-service";
import { affiliateCanaryGamentIds, affiliateProgramLive, affiliateRolloutMode, ensureAffiliateSchema } from "@/lib/affiliate-service";
import { ensurePublicIdentitySeparation } from "@/lib/public-profile";
import { codArenaLive, ensureCodArenaSchema } from "@/lib/cod-room-service";

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
    await Promise.all([
      ensurePrivateTournamentAttendanceSchema(),
      ensureStoreOrderLifecycleSchema(),
      ensureAffiliateSchema(),
      ensurePublicIdentitySeparation(),
      ensureCodArenaSchema(),
    ]);
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
        affiliateProgram: {
          configured: true,
          live: affiliateProgramLive(),
          rollout: affiliateRolloutMode(),
          canaryConfigured: affiliateCanaryGamentIds().length >= 2,
          attributionDays: 30,
          commissionTomanPerMatch: 7000,
          personalMinimumPayoutToman: 200000,
          destinations: ["bank", "gaming_wallet"],
        },
        codArena: {
          configured: true,
          live: codArenaLive(),
          privateBeta: !codArenaLive(),
          regions: ["global", "garena"],
          modes: ["solo", "duo", "squad"],
          rewards: ["kill", "placement", "participation"],
          referralModel: "service_fee_percentage",
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
