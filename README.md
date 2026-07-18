# Gament ⚡️ | پلتفرم هوشمند مسابقات گیمینگ

**گیمنت (Gament)** یک وب‌اپلیکیشن پیشرفته (PWA) برای برگزاری و مدیریت تورنمنت‌های بازی‌های موبایلی (کالاف دیوتی موبایل، فورتنایت و کلش رویال) است که با تمرکز بر **داوری هوشمند** و **تجربه کاربری لوکس** طراحی شده است.

---

## 💎 ویژگی‌های کلیدی (Core Features)

### ۱. هوش مصنوعی و داوری (AI Engine)
*   **داوری خودکار (AI Judging)**: تحلیل نتایج مسابقات توسط مدل‌های **Gemini 2.0** و **Llama 3.3** برای تشخیص پیروزی‌های غیرمنتظره (Upsets) و تقلب.
*   **سیستم سوئیچ خودکار (Failover)**: اتصال دوگانه به **OpenRouter** و **Groq**؛ در صورت قطع شدن یک سرویس، سیستم در کمتر از ۱ ثانیه روی مدل پشتیبان سوئیچ می‌کند.
*   **ناظر هوشمند چت**: بررسی بلادرنگ پیام‌ها و جلوگیری از محتوای نامناسب.

### ۲. سیستم مالی و کیف پول (Secure Wallet)
*   **معاملات اتمیک**: استفاده از تراکنش‌های دیتابیس برای جلوگیری از خطاهای مالی.
*   **دقت بانکی**: ذخیره‌سازی مبالغ به **ریال (BigInt)** در دیتابیس و نمایش به **تومان** در اپلیکیشن.
*   **امنیت تراکنش**: پیاده‌سازی **Row-Level Locking** برای جلوگیری از حملات Race Condition در هنگام واریز و برداشت.
*   **درگاه پرداخت**: آماده‌سازی زیرساخت برای اتصال به درگاه‌های ریالی.

### ۳. پیشرفت و گیمیفیکیشن (Leveling System)
*   **سیستم XP/Level**: محاسبه سطح کاربر بر اساس فعالیت و بردها با فرمول ریاضی دقیق:  
    `Level = Floor(sqrt(XP / 100)) + 1`
*   **رتبه‌بندی Elo**: سیستم امتیازدهی رتبه‌بندی (RP) برای ایجاد لیدربورد عادلانه و رقابتی.

### ۴. احراز هویت و امنیت (Security)
*   **ثبت‌نام با موبایل (اجباری) + ایمیل (اجباری) + رمز عبور**: شماره موبایل برای شناسایی/تماس همچنان الزامی است، اما تایید حساب با یک کد ۶ رقمی است که به ایمیل کاربر ارسال می‌شود (روی Render Free از طریق **Google Apps Script HTTPS relay**، با پشتیبانی اختیاری Resend/SMTP) — بدون نیاز به خرید پنل پیامک.
*   **جریان دو مرحله‌ای ثبت‌نام**: پس از پر کردن فرم، حساب ساخته می‌شود ولی ورود (session) فقط بعد از وارد کردن کد تایید ایمیل انجام می‌شود؛ تلاش برای ورود با حساب تاییدنشده مسدود شده و کد تایید دوباره نمایش داده می‌شود.
*   **شناسه گیمنت (Gament ID)**: تولید شناسه منحصر‌به‌فرد برای هر کاربر (مثلاً `FLX-1234`) جهت ردیابی در مسابقات.
*   **هشینگ پیشرفته**: استفاده از الگوریتم **Argon2** برای محافظت از رمزهای عبور و ذخیره‌سازی هش‌شده توکن نشست‌ها.

### ۵. تعامل و پشتیبانی
*   **چت جهانی موقت (Ephemeral Chat)**: نگهداری فقط ۵۰ پیام آخر برای بهینه‌سازی دیتابیس و حفظ حریم خصوصی.
*   **سیستم اخطار (Strikes)**: بن خودکار ۱۰ دقیقه‌ای کاربر پس از ۳ بار نقض قوانین چت.
*   **تیکتینگ لوکس**: سیستم پشتیبانی مستقیم داخلی با وضعیت‌های داینامیک.

---

## 🛠 پشته تکنولوژی (Tech Stack)

*   **Framework**: Next.js 16 (App Router) + React 19
*   **Language**: TypeScript (Strict Mode)
*   **Database**: PostgreSQL (Neon.tech) via Drizzle ORM
*   **Styling**: Tailwind CSS 4 (Luxury Glassmorphism / Dark Theme)
*   **AI**: OpenRouter (Gemini 2.0) + Groq (Llama 3.3)
*   **Email OTP**: Google Apps Script HTTPS relay (primary on Render Free), Resend/SMTP (optional)

---

## 📂 ساختار پوشه‌بندی (Project Structure)

```text
src/
├── app/                  # مسیرها و صفحات (Next.js App Router)
│   ├── api/              # سرویس‌های API (Auth, Wallet, AI, Chat)
│   ├── (auth)/           # صفحات ورود و ثبت‌نام
│   ├── leaderboard/      # صفحه رتبه‌بندی قهرمانان
│   ├── profile/          # مدیریت حساب و تیکتینگ
│   └── tournaments/      # آرنا مسابقات و لابی‌ها
├── components/           # کامپوننت‌های UI (Luxury Cards, BottomNav)
├── db/                   # تنظیمات دیتابیس و اسکیما (Drizzle)
├── lib/                  # منطق بیزنس (AI Manager, Wallet Service, Leveling)
└── contexts/             # مدیریت وضعیت‌ها (Theme, Auth, Language)
```

---

## 🤖 اتصال ربات تلگرام Gament

دو حالت برای ربات وجود دارد:

1. **حالت پیشنهادی و رایگان:** Webhook داخل همین وب‌اپ Next.js  
   مسیر: `POST /api/telegram/webhook`
2. **حالت Worker/Python، اختیاری:** کد قدیمی‌تر داخل پوشه `telegram_bot/` قرار دارد و برای VPS یا Background Worker قابل استفاده است.

برای حالت Webhook، این envها را در سرویس Render سایت تنظیم کنید:

```env
BOT_TOKEN="telegram_bot_token_from_botfather"
TELEGRAM_WEBHOOK_SECRET="your_long_random_webhook_secret"
TELEGRAM_ADMIN_IDS="your_numeric_telegram_id"
TELEGRAM_CHANNEL_URL="https://t.me/Gament_games"
TELEGRAM_CHANNEL_ID="@Gament_games"
```

Migrationهای لازم:

```bash
psql "$DATABASE_URL" -f drizzle/manual/0002_add_telegram_pre_registrations.sql
psql "$DATABASE_URL" -f drizzle/manual/0003_add_telegram_bot_sessions.sql
psql "$DATABASE_URL" -f drizzle/manual/0004_add_telegram_account_linking.sql
psql "$DATABASE_URL" -f drizzle/manual/0005_add_telegram_growth_and_notifications.sql
psql "$DATABASE_URL" -f drizzle/manual/0006_add_telegram_marketing_and_waitlist.sql
psql "$DATABASE_URL" -f drizzle/manual/0009_sync_core_schema.sql
psql "$DATABASE_URL" -f drizzle/manual/0010_harden_registration_integrity.sql
psql "$DATABASE_URL" -f drizzle/manual/0024_add_telegram_reliability.sql
psql "$DATABASE_URL" -f drizzle/manual/0025_repair_wallet_money_types.sql
psql "$DATABASE_URL" -f drizzle/manual/0026_repair_telegram_sent_notifications.sql
psql "$DATABASE_URL" -f drizzle/manual/0027_add_match_result_claims.sql
psql "$DATABASE_URL" -f drizzle/manual/0028_add_private_tournament_leaderboards.sql
psql "$DATABASE_URL" -f drizzle/manual/0029_add_private_tournament_attendance.sql
psql "$DATABASE_URL" -f drizzle/manual/0030_add_clash_ready_and_tournament_end.sql
psql "$DATABASE_URL" -f drizzle/manual/0031_add_store_order_deadlines.sql
```

یا محتوای فایل‌ها را داخل SQL Editor دیتابیس/Neon اجرا کنید.

بعد از Deploy، webhook تلگرام را ست کنید:

```text
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://www.gament1.ir/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

پیش‌ثبت‌نام‌ها داخل پنل ادمین، تب «تلگرام»، نمایش داده می‌شوند.

قابلیت‌های فعلی ربات Webhook:

- `/start` منوی اصلی با لینک وب‌اپ و کانال
- `/rooms` نمایش روم‌های فعال
- `/register` پیش‌ثبت‌نام مستقیم در پنل سایت
- `/link` ساخت کد یک‌بارمصرف برای اتصال قطعی حساب تلگرام به حساب Gament
- `/profile` نمایش پروفایل/وضعیت لینک حساب
- `/channel` لینک کانال `Gament_games`
- `/players` برای ادمین: آخرین پیش‌ثبت‌نام‌ها
- `/announce` برای ادمین: ارسال اطلاعیه عمومی
- `/announce_game` برای ادمین: ارسال اطلاعیه هدفمند بر اساس بازی
- `/post_latest` برای ادمین: انتشار دستی آخرین تورنومنت فعال در کانال
- دکمه Mini App برای باز کردن Gament داخل تلگرام
- `/wallet` نمایش کیف پول و تراکنش‌های اخیر؛ ثبت‌نام پولی از تلگرام با کسر کیف پول
- `/achievements` نمایش دستاوردها و پیشرفت
- `/my_tournaments` مشاهده تورنومنت‌های من، لابی، چک‌این و لغو ثبت‌نام
- آپلود اسکرین‌شات نتیجه از مسیر `/matches`
- `/daily` جایزه روزانه XP
- `/quiz` کوییز روزانه
- `/coupon` ثبت کد تخفیف/کمپین
- `/shop` لینک فروشگاه/کیف پول
- `/matches` مشاهده مسابقات و ثبت نتیجه/اعتراض تلگرامی
- `/qr` یا `/clash_link` برای 1V1 کلش رویال: ارسال «پیوند دوستی» از گزینه اشتراک‌گذاری پیوند بعد از پرداخت و مچ‌میکینگ خودکار دو نفره
- `/clash_tournament` مسابقات چندنفره Draft کلش با ظرفیت ۱۰/۵۰/۱۰۰/۲۰۰ نفر
- `/checkin` ثبت حضور در تورنومنت
- `/support` ساخت تیکت پشتیبانی از تلگرام
- `/invite` لینک دعوت اختصاصی
- `/missions` مأموریت‌های رشد/گیمیفیکیشن
- `/leaderboard` لیدربورد Gament
- `/ai` دستیار هوشمند Gament داخل تلگرام
- `/manage` مدیریت سریع تورنومنت برای ادمین
- `/judge` پنل داوری تلگرام
- `/health` مانیتور سلامت برای ادمین
- `/export_telegram` خروجی CSV تلگرام برای ادمین
- `/poll` ارسال نظرسنجی در کانال
- انتشار خودکار تورنومنت جدید در کانال `@Gament_games`
- یادآوری مسابقات، ارسال لابی و انتشار نتایج با Cron endpoint
- اطلاع خودکار به ادمین‌ها هنگام پیش‌ثبت‌نام جدید

---

## 🚀 راهنمای نصب و اجرا

۱. **کلون کردن پروژه**:
```bash
git clone https://github.com/farzadabbasi617-star/Flexa_app.git
cd Flexa_app
```

۲. **نصب وابستگی‌ها**:
```bash
npm install
```

۳. **تنظیم متغیرهای محیطی**:  
یک فایل `.env` بسازید و مقادیر زیر را وارد کنید:
```env
DATABASE_URL="your_postgresql_url"
OPENROUTER_API_KEY="your_key"
GROQ_API_KEY="your_key"
CLASH_ROYALE_API_TOKEN="your_supercell_api_token"
CLASH_ROYALE_API_BASE_URL="https://proxy.royaleapi.dev/v1"
# در production برای راه‌اندازی امن اولین مدیر اصلی لازم است
ADMIN_SETUP_SECRET="your_long_random_bootstrap_secret"
OTP_TOKEN_PEPPER="your_different_long_random_otp_hash_pepper"
# ارسال از gament1.ir@gmail.com روی Render Free از طریق HTTPS
# راهنما: docs/GOOGLE_APPS_SCRIPT_EMAIL.md
EMAIL_PROVIDER="google_apps_script"
GOOGLE_APPS_SCRIPT_EMAIL_URL="https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
GOOGLE_APPS_SCRIPT_EMAIL_SECRET="your_long_random_shared_secret"
```

**مهم:** بعد از `npm run db:push` (یا برای دیتابیس‌های موجود، اجرای دستی
`drizzle/manual/0019_add_email_verification.sql`)، ستون `email_verified_at`
باید در جدول `users` وجود داشته باشد وگرنه جریان ورود/ثبت‌نام با خطا مواجه
می‌شود.

۴. **ساخت جداول دیتابیس**:
```bash
npm run db:push
```

۵. **اجرای نسخه توسعه**:
```bash
npm run dev
```

---

## 🗺 نقشه راه (Roadmap)

- [x] سیستم داوری هوشمند و سوئیچ خودکار بین مدل‌ها.
- [x] طراحی رابط کاربری لوکس شیشه‌ای (Luxury Glass UI).
- [x] ثبت‌نام با موبایل و تولید Gament ID.
- [x] تایید حساب با کد ارسالی به ایمیل (بدون نیاز به پنل پیامک).
- [x] کیف پول اتمیک و سیستم تراکنش‌های ریالی.
- [x] چت جهانی تحت نظارت AI و سیستم تیکتینگ.
- [ ] پیاده‌سازی اپلیکیشن اندروید و iOS (PWA/Capacitor).
- [ ] سیستم پخش زنده (Live Streaming) برای مسابقات فینال.
- [ ] فروشگاه داخلی برای خرید مستقیم محصولات درون‌بازی (CP, Gems).

---
**ساخته شده با ❤️ برای جامعه گیمینگ ایران.**
