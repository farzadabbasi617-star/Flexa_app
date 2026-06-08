# Flexa ⚡

پلتفرم برگزاری تورنمنت بازی‌های موبایل — **کلش رویال، کالاف موبایل و فورتنایت** — با داوری کمک‌گرفته از هوش مصنوعی.

A tournament platform for mobile games (Clash Royale, COD Mobile, Fortnite) with AI-assisted judging.

---

## 🧱 Tech stack
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **PostgreSQL** (Neon) via **Drizzle ORM**
- **Tailwind CSS 4**
- **Vitest** for unit tests
- Auth: session cookies + **Argon2** password hashing

---

## 🚀 Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   then edit .env and set DATABASE_URL to your Postgres connection string

# 3. Apply the database schema
#    (first time: push the full schema)
npm run db:push
#    plus any manual migrations under drizzle/manual/, e.g.:
psql "$DATABASE_URL" -f drizzle/manual/0001_add_rate_limits.sql

# 4. Run the dev server
npm run dev          # http://localhost:3000
```

> First admin: register a normal account, then call `POST /api/admin/setup`
> while logged in — it promotes you to admin **only if no admin exists yet**.

---

## 📜 Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:push` | Push schema to the database |
| `npm run db:studio` | Open Drizzle Studio |

---

## 📁 Structure

```
src/
├─ app/
│  ├─ api/            # route handlers (auth, tournaments, matches, judging…)
│  └─ (pages)/        # UI pages (home, dashboard, admin, tournaments…)
├─ components/        # shared React components
├─ contexts/          # Auth & Language providers
├─ db/                # Drizzle schema + connection
└─ lib/               # pure logic: ai-engine, brackets, auth, rate-limit…
drizzle/manual/       # hand-written, idempotent SQL migrations
```

The pure logic in `src/lib` (AI judging, bracket generation) is unit-tested in
`*.test.ts` files next to each module.

---

## 🔐 Security notes
- **Never commit secrets.** `DATABASE_URL` and other secrets live in `.env`
  (git-ignored) and in your host's environment — not in source.
- Passwords are hashed with Argon2; sessions are httpOnly cookies with CSRF and
  user-agent checks.
- Privileged API routes are guarded by role (`requireRole` / `requireUser`).
- Rate limiting is database-backed so it works across multiple instances.

---

## ✅ CI
Every push / PR to `main` runs **lint → typecheck → test → build** via
GitHub Actions (`.github/workflows/ci.yml`).
