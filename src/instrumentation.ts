/**
 * Next.js boot hook. Runs once per server instance, before the first request.
 *
 * The idempotent `ensure*Schema()` helpers used to be awaited inside
 * /api/health, which meant five schema-reconciliation queries ran on every
 * single ping. Uptime monitors and the deploy smoke check hit that endpoint
 * frequently, so a health probe was doing real DDL-guard work each time and
 * a public request could hold open database work.
 *
 * Running them here keeps the guarantee they exist for (a freshly-deployed
 * instance reconciles its schema before serving) while paying the cost once.
 */
export async function register() {
  // Only the Node.js server runtime can talk to the database; the edge runtime
  // would fail to import pg.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { ensurePrivateTournamentAttendanceSchema },
    { ensureStoreOrderLifecycleSchema },
    { ensureAffiliateSchema },
    { ensurePublicIdentitySeparation },
    { ensureCodArenaSchema },
    { default: logger },
  ] = await Promise.all([
    import("@/lib/private-tournament-attendance"),
    import("@/lib/store-service"),
    import("@/lib/affiliate-service"),
    import("@/lib/public-profile"),
    import("@/lib/cod-room-service"),
    import("@/lib/logger"),
  ]);

  const tasks: Array<[string, () => Promise<unknown>]> = [
    ["privateTournamentAttendance", ensurePrivateTournamentAttendanceSchema],
    ["storeOrderLifecycle", ensureStoreOrderLifecycleSchema],
    ["affiliate", ensureAffiliateSchema],
    ["publicIdentitySeparation", ensurePublicIdentitySeparation],
    ["codArena", ensureCodArenaSchema],
  ];

  // A failure here must not stop the server from booting: the routes that rely
  // on each schema call their own ensure* guard anyway, so a transient database
  // hiccup at boot should degrade, not crash the deploy.
  await Promise.all(
    tasks.map(async ([name, run]) => {
      try {
        await run();
      } catch (error) {
        logger.error({ error, task: name }, "Startup schema reconciliation failed");
      }
    })
  );
}
