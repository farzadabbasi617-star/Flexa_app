import os
import sys
import logging
import asyncio
import requests
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

from aiohttp import web

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    ConversationHandler, filters, ContextTypes
)
from telegram.constants import ParseMode
from telegram.error import TelegramError

# ===================== پیکربندی =====================
BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
PORT = int(os.environ.get("PORT", "8000"))
BASE_URL = os.getenv("BASE_URL", "https://haghbakie-official.onrender.com").strip()
OWNER_ID = int(os.getenv("OWNER_ID", "248175860"))

# ===================== لاگینگ =====================
logging.basicConfig(format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info(f"BOT_TOKEN={'✅' if BOT_TOKEN else '❌'} DB={'✅' if DATABASE_URL else '❌'} GROQ={'✅' if GROQ_API_KEY else '❌'} PORT={PORT}")

if not BOT_TOKEN:
    logger.critical("❌ BOT_TOKEN not set!")
    sys.exit(1)
if not DATABASE_URL:
    logger.critical("❌ DATABASE_URL not set!")
    sys.exit(1)

# ===================== حالات =====================
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY = range(4)

# ===================== دیتابیس =====================
db_pool = None

def init_db_pool():
    global db_pool
    if db_pool is None:
        db_pool = ThreadedConnectionPool(minconn=1, maxconn=5, dsn=DATABASE_URL)
    return db_pool

def get_db_conn():
    return init_db_pool().getconn()

def return_db_conn(conn):
    if db_pool and conn:
        db_pool.putconn(conn)

class DBCursor:
    def __init__(self, conn):
        self.conn = conn
        self.cur = None
    def __enter__(self):
        self.cur = self.conn.cursor(cursor_factory=RealDictCursor)
        return self.cur
    def __exit__(self, *a):
        self.cur.close()

def init_db():
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS hbk_users (
                user_id BIGINT PRIMARY KEY, username TEXT, full_name TEXT,
                points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS hbk_stories (
                id SERIAL PRIMARY KEY, creator_id BIGINT REFERENCES hbk_users(user_id),
                title TEXT, content TEXT NOT NULL, side_a TEXT DEFAULT 'من',
                side_b TEXT DEFAULT 'طرف مقابل', ai_verdict TEXT, category TEXT,
                status TEXT DEFAULT 'active', votes_a INTEGER DEFAULT 0,
                votes_b INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS hbk_votes (
                id SERIAL PRIMARY KEY, story_id INTEGER REFERENCES hbk_stories(id),
                voter_id BIGINT REFERENCES hbk_users(user_id), choice CHAR(1),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(story_id, voter_id))""")
            for col, ct in [("votes_a","INTEGER DEFAULT 0"),("votes_b","INTEGER DEFAULT 0")]:
                try: cur.execute(f"ALTER TABLE hbk_stories ADD COLUMN IF NOT EXISTS {col} {ct}")
                except: pass
            try: cur.execute("ALTER TABLE hbk_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            except: pass
            conn.commit()
            logger.info("✅ DB ready")
    except Exception as e:
        logger.error(f"❌ DB init: {e}")
        conn.rollback()
        raise
    finally:
        return_db_conn(conn)

def ensure_user(user):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""INSERT INTO hbk_users (user_id, username, full_name) 
                VALUES (%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET 
                username=EXCLUDED.username, full_name=EXCLUDED.full_name""",
                (user.id, user.username or "", user.full_name or ""))
        conn.commit()
    except Exception as e:
        logger.error(f"ensure_user: {e}")
        conn.rollback()
    finally:
        return_db_conn(conn)

def ai_analyze(content, side_a="من", side_b="طرف مقابل"):
    if not GROQ_API_KEY:
        return "داستان جدید", "🤖 قاضی هوشمند در دسترس نیست."
    try:
        r = requests.post("https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"messages":[{"role":"user","content":(
                f"تحلیل کن: {side_a} vs {side_b}\nداستان: {content}\n"
                "دقیقاً در این قالب (بدون متن اضافه):\nTITLE: [تیتر فارسی]\nVERDICT: [نظر ۱-۲ جمله]"
            )}],"model":"llama3-8b-8192","temperature":0.7,"max_tokens":300}, timeout=20)
        r.raise_for_status()
        t = r.json()['choices'][0]['message']['content']
        title, verdict = "داستان جدید", "⚖️ نظر کارشناسی در دسترس نیست."
        for line in t.split('\n'):
            line = line.strip()
            if line.upper().startswith("TITLE:"): title = line.split("TITLE:",1)[1].strip().replace("*","").replace("_","")
            elif line.upper().startswith("VERDICT:"): verdict = line.split("VERDICT:",1)[1].strip()
        return title[:60], verdict
    except Exception as e:
        logger.error(f"Groq: {e}")
        return "داستان جدید", "🤖 قاضی هوشمند در دسترس نیست."

def main_kb():
    return ReplyKeyboardMarkup([["⚖️ ثبت پرونده جدید"],["🔥 پرونده‌های داغ","🎲 پرونده تصادفی"],["🏆 جدول برترین‌ها","📊 پرونده‌های من"]], resize_keyboard=True)

# ===================== هندلرها =====================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_user(update.effective_user)
    if context.args and context.args[0].startswith("story_"):
        try: return await show_story(update, context, int(context.args[0].replace("story_","")))
        except: pass
    await update.message.reply_text("⚖️ به دادگاه «حق با کیه؟» خوش آمدید!\n\n📝 داستان خود را بنویسید تا دیگران قضاوت کنند.\n🗳️ به پرونده‌های دیگران رأی دهید.\n🏆 امتیاز جمع کنید!", reply_markup=main_kb())

async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_user(update.effective_user)
    t = update.message.text.strip()
    if t == "🔥 پرونده‌های داغ": return await hot(update, context)
    if t == "🎲 پرونده تصادفی": return await rand(update, context)
    if t == "🏆 جدول برترین‌ها": return await lb(update, context)
    if t == "📊 پرونده‌های من": return await my(update, context)

async def hot(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT id, title, votes_a+votes_b as tv FROM hbk_stories WHERE status='active' ORDER BY tv DESC LIMIT 10")
            stories = cur.fetchall()
    finally: return_db_conn(conn)
    if not stories:
        await update.message.reply_text("🔍 هنوز پرونده‌ای ثبت نشده!", reply_markup=main_kb())
        return
    lines = ["🔥 **پرونده‌های داغ:**\n"]
    for i,s in enumerate(stories,1): lines.append(f"{i}. {s['title']} — 🗳 {s['tv']} رأی  |  /case_{s['id']}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)

async def rand(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT id FROM hbk_stories WHERE status='active' ORDER BY RANDOM() LIMIT 1")
            s = cur.fetchone()
    finally: return_db_conn(conn)
    if s: await show_story(update, context, s['id'])
    else: await update.message.reply_text("🔍 پرونده‌ای یافت نشد!", reply_markup=main_kb())

async def lb(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT full_name, username, points FROM hbk_users WHERE points>0 ORDER BY points DESC LIMIT 15")
            users = cur.fetchall()
    finally: return_db_conn(conn)
    if not users:
        await update.message.reply_text("🏆 هنوز کسی امتیازی کسب نکرده.", reply_markup=main_kb())
        return
    lines, medals = ["🏆 **برترین قاضی‌ها:**\n"], ["🥇","🥈","🥉"]
    for i,u in enumerate(users):
        m = medals[i] if i<3 else f"{i+1}."
        n = u['full_name'] or u['username'] or "ناشناس"
        lines.append(f"{m} {n} — ⭐ {u['points']}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)

async def my(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT id, title, status, votes_a, votes_b FROM hbk_stories WHERE creator_id=%s ORDER BY created_at DESC LIMIT 10", (update.effective_user.id,))
            stories = cur.fetchall()
    finally: return_db_conn(conn)
    if not stories:
        await update.message.reply_text("📭 پرونده‌ای ثبت نکرده‌اید.", reply_markup=main_kb())
        return
    lines = ["📊 **پرونده‌های من:**\n"]
    for s in stories:
        e = "🟢" if s['status']=='active' else "🔴"
        tv = (s['votes_a'] or 0)+(s['votes_b'] or 0)
        lines.append(f"{e} {s['title']} — 🗳 {tv} رأی  |  /case_{s['id']}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)

async def show_story(update, context, sid=None):
    if sid is None:
        if context.args:
            try: sid = int(context.args[0])
            except: await update.message.reply_text("⚠️ شناسه نامعتبر.", reply_markup=main_kb()); return
        else: await update.message.reply_text("⚠️ شناسه را وارد کنید.", reply_markup=main_kb()); return

    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""SELECT s.*, u.full_name cn, u.username cu FROM hbk_stories s 
                JOIN hbk_users u ON s.creator_id=u.user_id WHERE s.id=%s""", (sid,))
            s = cur.fetchone()
            if not s: await update.message.reply_text("🔍 یافت نشد.", reply_markup=main_kb()); return
            cur.execute("SELECT choice FROM hbk_votes WHERE story_id=%s AND voter_id=%s", (sid, update.effective_user.id))
            ev = cur.fetchone()
    finally: return_db_conn(conn)

    cn = s['cn'] or s['cu'] or "ناشناس"
    ta, tb = s['votes_a'] or 0, s['votes_b'] or 0
    tv = ta+tb; pa = round(ta/tv*100) if tv>0 else 0; pb = round(tb/tv*100) if tv>0 else 0

    text = (f"📋 **پرونده #{s['id']}**\n🔖 {s['title']}\n\n📝 {s['content']}\n\n"
            f"👤 **{s['side_a']}** 🆚 **{s['side_b']}**\n\n🤖 {s['ai_verdict']}\n\n"
            f"📊 ▫️{s['side_a']}: {pa}% ({ta}) | ▫️{s['side_b']}: {pb}% ({tb})\n📌 {cn}")
    if s['status']!='active': text += "\n⚠️ بسته شده."
    if ev: text += f"\n✅ رأی شما: **{s['side_a'] if ev['choice']=='A' else s['side_b']}**"

    kb = []
    if s['status']=='active' and not ev:
        kb = [[InlineKeyboardButton(f"🤚 {s['side_a']}", callback_data=f"vote_{sid}_A"),
               InlineKeyboardButton(f"🤚 {s['side_b']}", callback_data=f"vote_{sid}_B")]]

    if update.callback_query:
        await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(kb) if kb else None, parse_mode=ParseMode.MARKDOWN)
    else:
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(kb) if kb else None, parse_mode=ParseMode.MARKDOWN)

async def case_cmd(update, context): await show_story(update, context)

async def vote(update, context):
    q = update.callback_query; await q.answer()
    parts = q.data.split("_"); sid, ch = int(parts[1]), parts[2]

    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT * FROM hbk_stories WHERE id=%s AND status='active'", (sid,))
            s = cur.fetchone()
            if not s: await q.edit_message_text("⚠️ غیرفعال.", parse_mode=ParseMode.MARKDOWN); return
            try:
                cur.execute("INSERT INTO hbk_votes (story_id, voter_id, choice) VALUES (%s,%s,%s)", (sid, update.effective_user.id, ch))
                col = 'votes_a' if ch=='A' else 'votes_b'
                cur.execute(f"UPDATE hbk_stories SET {col}={col}+1 WHERE id=%s", (sid,))
                cur.execute("UPDATE hbk_users SET points=points+10 WHERE user_id=%s", (update.effective_user.id,))
                cur.execute("UPDATE hbk_users SET points=points+5 WHERE user_id=%s", (s['creator_id'],))
                conn.commit()
                await q.answer("✅ رأی ثبت شد!", show_alert=False)
            except psycopg2.errors.UniqueViolation:
                conn.rollback(); await q.answer("⚠️ قبلاً رأی داده‌اید!", show_alert=True); return
            cur.execute("""SELECT s.*, u.full_name cn, u.username cu FROM hbk_stories s 
                JOIN hbk_users u ON s.creator_id=u.user_id WHERE s.id=%s""", (sid,))
            s = cur.fetchone()
    finally: return_db_conn(conn)

    if not s: return
    ta, tb = s['votes_a'] or 0, s['votes_b'] or 0
    tv = ta+tb; pa = round(ta/tv*100) if tv>0 else 0; pb = round(tb/tv*100) if tv>0 else 0
    cn = s['cn'] or s['cu'] or "ناشناس"
    text = (f"📋 **پرونده #{s['id']}**\n🔖 {s['title']}\n\n📝 {s['content']}\n\n"
            f"👤 **{s['side_a']}** 🆚 **{s['side_b']}**\n\n🤖 {s['ai_verdict']}\n\n"
            f"📊 ▫️{s['side_a']}: {pa}% ({ta}) | ▫️{s['side_b']}: {pb}% ({tb})\n📌 {cn}\n\n✅ رأی ثبت شد! 🎉")
    await q.edit_message_text(text, parse_mode=ParseMode.MARKDOWN)

# ===================== ثبت پرونده =====================
async def sub_start(update, context):
    ensure_user(update.effective_user)
    await update.message.reply_text("⚖️ **ثبت پرونده جدید**\n\n📝 داستان را کامل بنویسید.\n/cancel برای لغو", parse_mode=ParseMode.MARKDOWN)
    return SUBMIT_STORY

async def sub_content(update, context):
    context.user_data['c'] = update.message.text.strip()
    if len(context.user_data['c']) < 20:
        await update.message.reply_text("⚠️ حداقل ۲۰ کاراکتر. /cancel")
        return SUBMIT_STORY
    await update.message.reply_text("👤 طرف اول؟ /cancel")
    return SUBMIT_SIDE_A

async def sub_a(update, context):
    context.user_data['a'] = update.message.text.strip()
    await update.message.reply_text("👤 طرف دوم؟ /cancel")
    return SUBMIT_SIDE_B

async def sub_b(update, context):
    context.user_data['b'] = update.message.text.strip()
    w = await update.message.reply_text("🤖 در حال تحلیل...")
    title, verdict = ai_analyze(context.user_data['c'], context.user_data['a'], context.user_data['b'])
    context.user_data['ai'] = {'title': title, 'verdict': verdict}
    await w.delete()
    preview = (f"🔖 **{title}**\n\n📝 {context.user_data['c']}\n\n"
               f"👤 {context.user_data['a']} 🆚 {context.user_data['b']}\n\n🤖 {verdict}\n\n✅ ثبت شود؟")
    kb = [[InlineKeyboardButton("✅ تایید", callback_data="confirm_story"), InlineKeyboardButton("❌ لغو", callback_data="cancel_story")]]
    await update.message.reply_text(preview, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
    return CONFIRM_STORY

async def sub_confirm(update, context):
    q = update.callback_query
    await q.answer()

    if q.data != "confirm_story":
        await q.edit_message_text("❌ ثبت پرونده لغو شد.", reply_markup=main_kb())
        context.user_data.clear()
        return ConversationHandler.END

    # ===== تایید و ثبت =====
    # اطمینان از وجود کاربر در دیتابیس (برای Foreign Key)
    ensure_user(update.effective_user)

    # بررسی وجود داده‌های ضروری
    ai_data = context.user_data.get('ai', {})
    title = ai_data.get('title', 'داستان جدید')
    verdict = ai_data.get('verdict', '⚖️ بدون نظر کارشناسی')
    content = context.user_data.get('c', '')
    side_a = context.user_data.get('a', 'من')
    side_b = context.user_data.get('b', 'طرف مقابل')

    if not content:
        await q.edit_message_text("❌ خطا: متن داستان یافت نشد. لطفاً دوباره تلاش کنید.", reply_markup=main_kb())
        context.user_data.clear()
        return ConversationHandler.END

    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute(
                """INSERT INTO hbk_stories (creator_id, title, content, side_a, side_b, ai_verdict, expires_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (update.effective_user.id, title, content, side_a, side_b, verdict,
                 datetime.now() + timedelta(hours=48))
            )
            sid = cur.fetchone()['id']
        conn.commit()
        logger.info(f"✅ Story #{sid} created by user {update.effective_user.id}")
    except psycopg2.errors.ForeignKeyViolation:
        conn.rollback()
        logger.error(f"Foreign key violation for user {update.effective_user.id}")
        # تلاش مجدد برای ثبت کاربر
        ensure_user(update.effective_user)
        try:
            with DBCursor(conn) as cur:
                cur.execute(
                    """INSERT INTO hbk_stories (creator_id, title, content, side_a, side_b, ai_verdict, expires_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (update.effective_user.id, title, content, side_a, side_b, verdict,
                     datetime.now() + timedelta(hours=48))
                )
                sid = cur.fetchone()['id']
            conn.commit()
            logger.info(f"✅ Story #{sid} created on retry")
        except Exception as e2:
            conn.rollback()
            logger.error(f"Retry also failed: {e2}")
            await q.edit_message_text("❌ خطا در ثبت پرونده. لطفاً /start را بزنید و دوباره تلاش کنید.", reply_markup=main_kb())
            context.user_data.clear()
            return ConversationHandler.END
    except Exception as e:
        conn.rollback()
        logger.error(f"Insert story error: {type(e).__name__}: {e}")
        await q.edit_message_text(f"❌ خطا در ثبت پرونده. لطفاً دوباره تلاش کنید.\n(اگر تکرار شد /start را بزنید)", reply_markup=main_kb())
        context.user_data.clear()
        return ConversationHandler.END
    finally:
        return_db_conn(conn)

    # موفقیت
    try:
        bu = (await context.bot.get_me()).username
    except Exception:
        bu = "HaghBaKieBot"

    await q.edit_message_text(
        f"✅ **پرونده با موفقیت ثبت شد!**\n\n"
        f"🔖 {title}\n"
        f"🆔 شماره پرونده: #{sid}\n\n"
        f"🔗 لینک اشتراک‌گذاری:\n"
        f"https://t.me/{bu}?start=story_{sid}\n\n"
        f"⏰ این پرونده ۴۸ ساعت باز است.\n"
        f"📊 منتظر رأی دیگران باشید!",
        parse_mode=ParseMode.MARKDOWN
    )

    context.user_data.clear()
    return ConversationHandler.END

async def cancel(update, context):
    context.user_data.clear()
    await update.message.reply_text("🚫 لغو شد.", reply_markup=main_kb())
    return ConversationHandler.END

async def err(update, context):
    logger.error("Error:", exc_info=context.error)

# ===================== سرور Webhook سفارشی با Health Check =====================
async def health_check(request):
    """Health check endpoint برای Render"""
    return web.Response(text="OK", status=200)

async def webhook_handler(request):
    """دریافت آپدیت‌های تلگرام و ارسال به Application"""
    try:
        data = await request.json()
        update = Update.de_json(data, request.app['ptb_app'].bot)
        await request.app['ptb_app'].process_update(update)
    except Exception as e:
        logger.error(f"Webhook error: {e}")
    return web.Response(status=200)

async def set_webhook(app):
    """تنظیم webhook در تلگرام"""
    url = f"{BASE_URL}/webhook"
    logger.info(f"🔗 Setting webhook: {url}")
    await app.bot.set_webhook(url=url, drop_pending_updates=True)

async def on_startup(app):
    """راه‌اندازی Application تلگرام"""
    logger.info("🔄 Starting PTB application...")
    ptb_app = Application.builder().token(BOT_TOKEN).build()

    # هندلرها
    ptb_app.add_handler(CommandHandler("start", start))
    ptb_app.add_handler(CommandHandler("case", case_cmd))
    ptb_app.add_handler(MessageHandler(filters.TEXT & filters.Regex(r"^(🔥 پرونده‌های داغ|🎲 پرونده تصادفی|🏆 جدول برترین‌ها|📊 پرونده‌های من)$"), menu))
    ptb_app.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), sub_start)],
        states={SUBMIT_STORY:[MessageHandler(filters.TEXT & ~filters.COMMAND, sub_content)],
                SUBMIT_SIDE_A:[MessageHandler(filters.TEXT & ~filters.COMMAND, sub_a)],
                SUBMIT_SIDE_B:[MessageHandler(filters.TEXT & ~filters.COMMAND, sub_b)],
                CONFIRM_STORY:[CallbackQueryHandler(sub_confirm, pattern="^(confirm|cancel)_story$")]},
        fallbacks=[CommandHandler("cancel", cancel), CommandHandler("start", start)], allow_reentry=True))
    ptb_app.add_handler(CallbackQueryHandler(vote, pattern=r"^vote_\d+_[AB]$"))
    ptb_app.add_error_handler(err)

    await ptb_app.initialize()
    await ptb_app.start()
    await set_webhook(ptb_app)
    app['ptb_app'] = ptb_app
    logger.info("✅ Bot is ready!")

async def on_shutdown(app):
    """خاموش کردن بات"""
    ptb_app = app.get('ptb_app')
    if ptb_app:
        logger.info("⏹️ Shutting down...")
        await ptb_app.updater.stop()
        await ptb_app.stop()
        await ptb_app.shutdown()

# ===================== اجرا =====================
def main():
    logger.info("🚀 Starting HaghBaKie bot...")

    # دیتابیس
    try:
        init_db()
    except Exception as e:
        logger.critical(f"💥 DB fatal error: {e}")
        sys.exit(1)

    # ساخت اپلیکیشن aiohttp
    app = web.Application()
    app.router.add_get("/", health_check)
    app.router.add_post("/webhook", webhook_handler)
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    logger.info(f"🌐 Listening on 0.0.0.0:{PORT}")
    web.run_app(app, host="0.0.0.0", port=PORT)

if __name__ == "__main__":
    main()
