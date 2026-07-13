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
| `0002_add_telegram_pre_registrations.sql` | Adds the `telegram_pre_registrations` table used by the Gament Telegram bot integration and admin console. |
| `0003_add_telegram_bot_sessions.sql` | Adds the `telegram_bot_sessions` table used by the free Telegram webhook running inside the Next.js web service. |
| `0004_add_telegram_account_linking.sql` | Adds `telegram_accounts` and `telegram_link_codes` for linking Telegram accounts to Gament users with one-time codes. |
| `0005_add_telegram_growth_and_notifications.sql` | Adds referral tracking and notification de-duplication for reminders, lobby notices and channel result posts. |
| `0006_add_telegram_marketing_and_waitlist.sql` | Adds campaign analytics, real coupons/redemptions, tournament waiting list and Telegram channel post tracking. |
| `0007_add_classified_ads.sql` | Adds `classified_ads` and `classified_scrape_logs` tables for monitoring Divar/Sheypoor gaming ads. |
| `0008_add_honors.sql` | Adds the persistent `honors` table for the Hall of Fame public page, admin approval flow and AI honor suggestions. |
| `0009_sync_core_schema.sql` | Adds missing core tables/columns for databases created from the early partial migration. |
| `0010_harden_registration_integrity.sql` | Adds unique indexes that prevent duplicate tournament registrations per player/user under concurrent requests. |
| `0019_add_email_verification.sql` | Adds `users.email_verified_at`, backfilled for existing rows. Required for the email-OTP registration/login flow (see below). |
| `0020_add_first_last_name.sql` | Adds `users.first_name` and `users.last_name`, backfilled by splitting the existing `display_name`. Required for the "first name + last name" registration fields. |
| `0021_add_age_gate_fields.sql` | Adds age-gate identity fields for paid tournament eligibility. |
| `0022_add_registration_game_invites.sql` | Adds per-registration game invite fields for Clash Royale QR/Share Link matchmaking in the Telegram bot. |

> **Email verification (required before deploying the email-OTP auth flow):**
> Run `0019_add_email_verification.sql` and set `RESEND_API_KEY` (and
> optionally `RESEND_FROM_EMAIL`) in your environment. Without a configured
> Resend key, `EmailService` still generates and stores the OTP (so nothing
> crashes) but doesn't actually deliver an email — the code is only returned
> to the client in non-production environments for local testing.

> Note: the rate limiter **fails open** — if this table is missing or the DB
> errors, requests are still allowed (and the issue is logged), so forgetting
> to run the migration won't take the site down. But the limiter won't actually
> throttle until the table exists.
