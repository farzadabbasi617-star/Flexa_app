# Manual migrations

This project historically used `drizzle-kit push` (no migration history), so
these are small, **idempotent** SQL files you apply by hand when the schema
changes. Each uses `IF NOT EXISTS`, so they are safe to run more than once and
safe on an existing database.

## How to apply

```bash
psql "$DATABASE_URL" -f drizzle/manual/0001_add_rate_limits.sql
```

…or paste the file contents into the Neon SQL editor.

## Files

| File | What it does |
|------|--------------|
| `0001_add_rate_limits.sql` | Adds the `rate_limits` table used by the distributed (DB-backed) rate limiter in `src/lib/rate-limit.ts`. |

> Note: the rate limiter **fails open** — if this table is missing or the DB
> errors, requests are still allowed (and the issue is logged), so forgetting
> to run the migration won't take the site down. But the limiter won't actually
> throttle until the table exists.
