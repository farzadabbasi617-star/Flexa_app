# راهنمای Deploy پروژه Flexa روی Render

> این فایل عمداً هیچ کلید یا رمز واقعی ندارد. Secretها را فقط داخل داشبورد Render وارد کنید و داخل GitHub کامیت نکنید.

## 1) تنظیمات Web Service در Render

در سرویس Render پروژه:

- **Build Command**

```bash
npm ci --include=dev && npm run build
```

- **Start Command**

```bash
npm run start
```

- **Health Check Path**

```txt
/api/health
```

اگر Render در آینده با port مشکل داشت، Start Command را به این تغییر دهید:

```bash
npm run start -- -p $PORT
```

## 2) Environment Variables

در مسیر زیر در داشبورد Render:

```txt
Web Service → Environment → Add Environment Variable
```

این متغیرها را اضافه کنید. مقدارها را بدون کوتیشن `"` وارد کنید.

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
OPENROUTER_API_KEY=your_openrouter_key
GROQ_API_KEY=your_groq_key
NODE_ENV=production
BOT_TOKEN=telegram_bot_token_from_botfather
TELEGRAM_WEBHOOK_SECRET=your_long_random_webhook_secret
TELEGRAM_ADMIN_IDS=your_numeric_telegram_id
TELEGRAM_CHANNEL_URL=https://t.me/Flexa_games
TELEGRAM_CHANNEL_ID=@Flexa_games
# Optional legacy Python-worker integration:
TELEGRAM_INTEGRATION_SECRET=your_long_random_secret
```

فعلاً چون SMS/OTP هنوز فعال نشده، FarazSMS اختیاری است:

```env
FARAZSMS_API_KEY=optional_for_now
FARAZSMS_PATTERN_CODE=optional_for_now
FARAZSMS_SENDER=+983000505
```

نکته مهم برای Neon:

- مقدار `DATABASE_URL` باید URL خام PostgreSQL باشد.
- اگر جایی URL تبدیل به لینک Markdown شد و داخلش `[]` یا `mailto:` آمد، آن مقدار اشتباه است.
- فرمت درست باید شبیه این باشد:

```txt
postgresql://neondb_owner:<PASSWORD>@<HOST>/neondb?sslmode=require
```

## 3) ساخت جدول‌های دیتابیس

بعد از ست کردن `DATABASE_URL`، باید schema دیتابیس ساخته شود.

### روش ساده برای شروع

روی سیستم خودتان یا Render Shell این دستور را اجرا کنید:

```bash
npm run db:push
```

برای دیتابیس production بهتر است قبل از اجرای push مطمئن شوید دیتابیس خالی است یا backup دارید.

### migration دستی اتصال تلگرام

اگر دیتابیس از قبل ساخته شده، برای جدول پیش‌ثبت‌نام و وضعیت مکالمه تلگرام این SQLها را هم اجرا کنید:

```bash
psql "$DATABASE_URL" -f drizzle/manual/0002_add_telegram_pre_registrations.sql
psql "$DATABASE_URL" -f drizzle/manual/0003_add_telegram_bot_sessions.sql
```

یا محتوای همین فایل‌ها را در SQL Editor دیتابیس paste و اجرا کنید.

بعد از Deploy، webhook را با BotFather/API تلگرام ست کنید:

```txt
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://flexa-app-1.onrender.com/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

## 4) Redeploy

بعد از تنظیم env و ساخت دیتابیس:

```txt
Manual Deploy → Deploy latest commit
```

سپس Health Check را تست کنید:

```txt
https://YOUR_RENDER_DOMAIN/api/health
```

اگر خروجی این بود یعنی اتصال دیتابیس درست است:

```json
{ "ok": true }
```

## 5) نکته امنیتی

اگر کلید API یا URL دیتابیس را جایی خارج از Render وارد کرده‌اید یا در چت/اسکرین‌شات/گیت منتشر شده، بعد از راه‌اندازی آن‌ها را Rotate کنید.
