import os
import sys
import logging
import asyncio
import requests
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

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
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# لاگ startup برای دیباگ
logger.info(f"🚀 شروع بارگذاری ماژول...")
logger.info(f"BOT_TOKEN set: {bool(BOT_TOKEN)}")
logger.info(f"DATABASE_URL set: {bool(DATABASE_URL)}")
logger.info(f"GROQ_API_KEY set: {bool(GROQ_API_KEY)}")
logger.info(f"PORT: {PORT}")
logger.info(f"BASE_URL: {BASE_URL}")

if not BOT_TOKEN:
    logger.critical("❌ BOT_TOKEN تنظیم نشده! بات نمی‌تواند اجرا شود.")
    sys.exit(1)
if not DATABASE_URL:
    logger.critical("❌ DATABASE_URL تنظیم نشده! بات نمی‌تواند اجرا شود.")
    sys.exit(1)

# ===================== حالات مکالمه =====================
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY = range(4)

# ===================== دیتابیس =====================
db_pool = None

def init_db_pool():
    global db_pool
    if db_pool is None:
        logger.info("🔄 ایجاد Connection Pool...")
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
    def __exit__(self, exc_type, exc_val, exc_tb):
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
            # Migration ستون‌های جدید
            for col, ct in [("votes_a", "INTEGER DEFAULT 0"), ("votes_b", "INTEGER DEFAULT 0")]:
                try:
                    cur.execute(f"ALTER TABLE hbk_stories ADD COLUMN IF NOT EXISTS {col} {ct}")
                except Exception:
                    pass
            try:
                cur.execute("ALTER TABLE hbk_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            except Exception:
                pass
            conn.commit()
            logger.info("✅ جداول دیتابیس آماده شدند.")
    except Exception as e:
        logger.error(f"❌ خطا در init_db: {e}")
        conn.rollback()
        raise
    finally:
        return_db_conn(conn)

def ensure_user(user):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute(
                """INSERT INTO hbk_users (user_id, username, full_name) 
                   VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET 
                   username = EXCLUDED.username, full_name = EXCLUDED.full_name""",
                (user.id, user.username or "", user.full_name or ""))
        conn.commit()
    except Exception as e:
        logger.error(f"ensure_user error: {e}")
        conn.rollback()
    finally:
        return_db_conn(conn)

# ===================== هوش مصنوعی =====================
def ai_analyze_story(content, side_a="من", side_b="طرف مقابل"):
    if not GROQ_API_KEY:
        return "داستان جدید", "🤖 قاضی هوشمند در حال حاضر در دسترس نیست."
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"messages": [{"role": "user", "content": (
                f"تحلیل کن: طرف اول: {side_a} | طرف دوم: {side_b}\n"
                f"داستان: {content}\n\n"
                f"دقیقاً در قالب زیر (بدون متن اضافه):\n"
                f"TITLE: [تیتر کوتاه جذاب فارسی]\n"
                f"VERDICT: [نظر کارشناسی ۱-۲ جمله]"
            )}], "model": "llama3-8b-8192", "temperature": 0.7, "max_tokens": 300},
            timeout=20)
        resp.raise_for_status()
        text = resp.json()['choices'][0]['message']['content']
        title, verdict = "داستان جدید", "⚖️ نظر کارشناسی در دسترس نیست."
        for line in text.split('\n'):
            line = line.strip()
            if line.upper().startswith("TITLE:"):
                title = line.split("TITLE:", 1)[1].strip().replace("*", "").replace("_", "").replace("`", "")
            elif line.upper().startswith("VERDICT:"):
                verdict = line.split("VERDICT:", 1)[1].strip()
        if len(title) > 60:
            title = title[:57] + "..."
        return title, verdict
    except Exception as e:
        logger.error(f"Groq error: {e}")
        return "داستان جدید", "🤖 قاضی هوشمند در دسترس نیست."

# ===================== کیبورد =====================
def main_keyboard():
    return ReplyKeyboardMarkup([
        ["⚖️ ثبت پرونده جدید"],
        ["🔥 پرونده‌های داغ", "🎲 پرونده تصادفی"],
        ["🏆 جدول برترین‌ها", "📊 پرونده‌های من"]
    ], resize_keyboard=True)

# ===================== هندلرها =====================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_user(update.effective_user)
    if context.args and len(context.args) > 0 and context.args[0].startswith("story_"):
        try:
            return await show_story(update, context, int(context.args[0].replace("story_", "")))
        except ValueError:
            pass
    await update.message.reply_text(
        "⚖️ به دادگاه «حق با کیه؟» خوش آمدید!\n\n"
        "📝 داستان اختلاف خود را بنویسید تا دیگران قضاوت کنند.\n"
        "🗳️ یا به پرونده‌های دیگران رأی دهید.\n"
        "🏆 امتیاز جمع کنید و جزو برترین قاضی‌ها شوید!",
        reply_markup=main_keyboard())

async def handle_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()
    ensure_user(update.effective_user)
    if text == "🔥 پرونده‌های داغ": return await hot_stories(update, context)
    elif text == "🎲 پرونده تصادفی": return await random_story(update, context)
    elif text == "🏆 جدول برترین‌ها": return await leaderboard(update, context)
    elif text == "📊 پرونده‌های من": return await my_stories(update, context)

async def hot_stories(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""SELECT s.id, s.title, s.votes_a + s.votes_b as total_votes
                FROM hbk_stories s WHERE s.status = 'active'
                ORDER BY total_votes DESC LIMIT 10""")
            stories = cur.fetchall()
    finally:
        return_db_conn(conn)
    if not stories:
        await update.message.reply_text("🔍 هنوز هیچ پرونده‌ای ثبت نشده!", reply_markup=main_keyboard())
        return
    lines = ["🔥 **پرونده‌های داغ:**\n"]
    for i, s in enumerate(stories, 1):
        lines.append(f"{i}. {s['title']} — 🗳 {s['total_votes']} رأی  |  /case_{s['id']}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)

async def random_story(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT id FROM hbk_stories WHERE status = 'active' ORDER BY RANDOM() LIMIT 1")
            story = cur.fetchone()
    finally:
        return_db_conn(conn)
    if not story:
        await update.message.reply_text("🔍 هنوز هیچ پرونده‌ای ثبت نشده!", reply_markup=main_keyboard())
        return
    await show_story(update, context, story['id'])

async def leaderboard(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT user_id, full_name, username, points FROM hbk_users WHERE points > 0 ORDER BY points DESC LIMIT 15")
            users = cur.fetchall()
    finally:
        return_db_conn(conn)
    if not users:
        await update.message.reply_text("🏆 هنوز کسی امتیازی کسب نکرده.", reply_markup=main_keyboard())
        return
    lines = ["🏆 **جدول برترین قاضی‌ها:**\n"]
    medals = ["🥇", "🥈", "🥉"]
    for i, u in enumerate(users):
        medal = medals[i] if i < 3 else f"{i+1}."
        name = u['full_name'] or u['username'] or f"کاربر {u['user_id']}"
        lines.append(f"{medal} {name} — ⭐ {u['points']} امتیاز")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)

async def my_stories(update, context):
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT id, title, status, votes_a, votes_b FROM hbk_stories WHERE creator_id = %s ORDER BY created_at DESC LIMIT 10",
                       (update.effective_user.id,))
            stories = cur.fetchall()
    finally:
        return_db_conn(conn)
    if not stories:
        await update.message.reply_text("📭 شما هنوز هیچ پرونده‌ای ثبت نکرده‌اید.", reply_markup=main_keyboard())
        return
    lines = ["📊 **پرونده‌های من:**\n"]
    for s in stories:
        emoji = "🟢" if s['status'] == 'active' else "🔴"
        total = (s['votes_a'] or 0) + (s['votes_b'] or 0)
        lines.append(f"{emoji} {s['title']} — 🗳 {total} رأی  |  /case_{s['id']}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)

async def show_story(update, context, story_id=None):
    if story_id is None:
        if context.args:
            try:
                story_id = int(context.args[0])
            except ValueError:
                await update.message.reply_text("⚠️ شناسه نامعتبر.", reply_markup=main_keyboard())
                return
        else:
            await update.message.reply_text("⚠️ شناسه پرونده را وارد کنید.", reply_markup=main_keyboard())
            return

    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""SELECT s.*, u.full_name as cn, u.username as cu
                FROM hbk_stories s JOIN hbk_users u ON s.creator_id = u.user_id
                WHERE s.id = %s""", (story_id,))
            story = cur.fetchone()
            if not story:
                await update.message.reply_text("🔍 پرونده یافت نشد.", reply_markup=main_keyboard())
                return
            cur.execute("SELECT choice FROM hbk_votes WHERE story_id = %s AND voter_id = %s",
                       (story_id, update.effective_user.id))
            existing = cur.fetchone()
    finally:
        return_db_conn(conn)

    cn = story['cn'] or story['cu'] or "ناشناس"
    ta, tb = story['votes_a'] or 0, story['votes_b'] or 0
    tv = ta + tb
    pa = round(ta / tv * 100) if tv > 0 else 0
    pb = round(tb / tv * 100) if tv > 0 else 0

    text = (f"📋 **پرونده #{story['id']}**\n🔖 {story['title']}\n\n"
            f"📝 {story['content']}\n\n"
            f"👤 **{story['side_a']}** 🆚 **{story['side_b']}**\n\n"
            f"🤖 {story['ai_verdict']}\n\n"
            f"📊 ▫️{story['side_a']}: {pa}% ({ta}) | ▫️{story['side_b']}: {pb}% ({tb})\n"
            f"📌 توسط: {cn}")

    if story['status'] != 'active':
        text += "\n⚠️ بسته شده."
    if existing:
        text += f"\n✅ رأی شما: **{story['side_a'] if existing['choice'] == 'A' else story['side_b']}**"

    kb = []
    if story['status'] == 'active' and not existing:
        kb = [[InlineKeyboardButton(f"🤚 {story['side_a']}", callback_data=f"vote_{story_id}_A"),
               InlineKeyboardButton(f"🤚 {story['side_b']}", callback_data=f"vote_{story_id}_B")]]

    if update.callback_query:
        await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(kb) if kb else None, parse_mode=ParseMode.MARKDOWN)
    else:
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(kb) if kb else None, parse_mode=ParseMode.MARKDOWN)

async def case_command(update, context):
    await show_story(update, context)

async def handle_vote(update, context):
    query = update.callback_query
    await query.answer()
    data = query.data
    if not data.startswith("vote_"):
        return
    parts = data.split("_")
    story_id, choice = int(parts[1]), parts[2]

    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("SELECT * FROM hbk_stories WHERE id = %s AND status = 'active'", (story_id,))
            story = cur.fetchone()
            if not story:
                await query.edit_message_text("⚠️ پرونده غیرفعال.", parse_mode=ParseMode.MARKDOWN)
                return
            try:
                cur.execute("INSERT INTO hbk_votes (story_id, voter_id, choice) VALUES (%s, %s, %s)",
                           (story_id, update.effective_user.id, choice))
                col = 'votes_a' if choice == 'A' else 'votes_b'
                cur.execute(f"UPDATE hbk_stories SET {col} = {col} + 1 WHERE id = %s", (story_id,))
                cur.execute("UPDATE hbk_users SET points = points + 10 WHERE user_id = %s", (update.effective_user.id,))
                cur.execute("UPDATE hbk_users SET points = points + 5 WHERE user_id = %s", (story['creator_id'],))
                conn.commit()
                await query.answer(f"✅ رأی شما ثبت شد!", show_alert=False)
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                await query.answer("⚠️ قبلاً رأی داده‌اید!", show_alert=True)
                return
            cur.execute("""SELECT s.*, u.full_name as cn, u.username as cu
                FROM hbk_stories s JOIN hbk_users u ON s.creator_id = u.user_id WHERE s.id = %s""", (story_id,))
            story = cur.fetchone()
    finally:
        return_db_conn(conn)

    if not story: return
    ta, tb = story['votes_a'] or 0, story['votes_b'] or 0
    tv = ta + tb
    pa = round(ta / tv * 100) if tv > 0 else 0
    pb = round(tb / tv * 100) if tv > 0 else 0
    cn = story['cn'] or story['cu'] or "ناشناس"
    text = (f"📋 **پرونده #{story['id']}**\n🔖 {story['title']}\n\n"
            f"📝 {story['content']}\n\n"
            f"👤 **{story['side_a']}** 🆚 **{story['side_b']}**\n\n"
            f"🤖 {story['ai_verdict']}\n\n"
            f"📊 ▫️{story['side_a']}: {pa}% ({ta}) | ▫️{story['side_b']}: {pb}% ({tb})\n"
            f"📌 {cn}\n\n✅ رأی ثبت شد! 🎉")
    await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN)

# ===================== ثبت پرونده جدید =====================
async def start_submit(update, context):
    await update.message.reply_text("⚖️ **ثبت پرونده جدید**\n\n📝 داستان را کامل بنویسید.\nبرای لغو: /cancel", parse_mode=ParseMode.MARKDOWN)
    return SUBMIT_STORY

async def get_content(update, context):
    context.user_data['story_content'] = update.message.text.strip()
    if len(context.user_data['story_content']) < 20:
        await update.message.reply_text("⚠️ حداقل ۲۰ کاراکتر بنویسید. /cancel برای لغو")
        return SUBMIT_STORY
    await update.message.reply_text("👤 طرف اول؟ /cancel")
    return SUBMIT_SIDE_A

async def get_side_a(update, context):
    context.user_data['side_a'] = update.message.text.strip()
    await update.message.reply_text("👤 طرف دوم؟ /cancel")
    return SUBMIT_SIDE_B

async def get_side_b(update, context):
    context.user_data['side_b'] = update.message.text.strip()
    wait_msg = await update.message.reply_text("🤖 در حال تحلیل...")
    title, verdict = ai_analyze_story(context.user_data['story_content'], context.user_data['side_a'], context.user_data['side_b'])
    context.user_data['ai'] = {'title': title, 'verdict': verdict}
    await wait_msg.delete()
    preview = (f"🔖 **{title}**\n\n📝 {context.user_data['story_content']}\n\n"
               f"👤 {context.user_data['side_a']} 🆚 {context.user_data['side_b']}\n\n"
               f"🤖 {verdict}\n\n✅ ثبت شود؟")
    kb = [[InlineKeyboardButton("✅ تایید", callback_data="confirm_story"),
           InlineKeyboardButton("❌ لغو", callback_data="cancel_story")]]
    await update.message.reply_text(preview, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
    return CONFIRM_STORY

async def confirm_story(update, context):
    query = update.callback_query
    await query.answer()
    if query.data == "confirm_story":
        conn = get_db_conn()
        try:
            with DBCursor(conn) as cur:
                cur.execute("""INSERT INTO hbk_stories (creator_id, title, content, side_a, side_b, ai_verdict, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (update.effective_user.id, context.user_data['ai']['title'], context.user_data['story_content'],
                     context.user_data['side_a'], context.user_data['side_b'], context.user_data['ai']['verdict'],
                     datetime.now() + timedelta(hours=48)))
                s_id = cur.fetchone()['id']
            conn.commit()
        except Exception as e:
            logger.error(f"confirm_story error: {e}")
            conn.rollback()
            await query.edit_message_text("❌ خطا در ثبت.")
            return ConversationHandler.END
        finally:
            return_db_conn(conn)
        bot_un = (await context.bot.get_me()).username
        link = f"https://t.me/{bot_un}?start=story_{s_id}"
        await query.edit_message_text(f"✅ **ثبت شد!**\n🔖 {context.user_data['ai']['title']}\n🆔 #{s_id}\n🔗 {link}\n⏰ ۴۸ ساعت", parse_mode=ParseMode.MARKDOWN)
    else:
        await query.edit_message_text("❌ لغو شد.")
    context.user_data.clear()
    return ConversationHandler.END

async def cancel(update, context):
    context.user_data.clear()
    await update.message.reply_text("🚫 لغو شد.", reply_markup=main_keyboard())
    return ConversationHandler.END

async def error_handler(update, context):
    logger.error("Error:", exc_info=context.error)
    try:
        if update and hasattr(update, 'effective_chat'):
            await context.bot.send_message(chat_id=update.effective_chat.id, text="❌ خطایی رخ داد.")
    except:
        pass

# ===================== راه‌اندازی =====================
async def main():
    logger.info("🔄 شروع راه‌اندازی...")
    
    # دیتابیس
    try:
        init_db()
    except Exception as e:
        logger.critical(f"❌ خطای بحرانی در دیتابیس: {e}")
        sys.exit(1)

    # ساخت Application
    app = Application.builder().token(BOT_TOKEN).build()

    # هندلرها
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("case", case_command))
    app.add_handler(MessageHandler(
        filters.TEXT & filters.Regex(r"^(🔥 پرونده‌های داغ|🎲 پرونده تصادفی|🏆 جدول برترین‌ها|📊 پرونده‌های من)$"),
        handle_menu))
    app.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit)],
        states={
            SUBMIT_STORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_content)],
            SUBMIT_SIDE_A: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a)],
            SUBMIT_SIDE_B: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b)],
            CONFIRM_STORY: [CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$")],
        },
        fallbacks=[CommandHandler("cancel", cancel), CommandHandler("start", start)],
        allow_reentry=True))
    app.add_handler(CallbackQueryHandler(handle_vote, pattern=r"^vote_\d+_[AB]$"))
    app.add_error_handler(error_handler)

    # Webhook
    logger.info(f"🚀 Webhook روی پورت {PORT} -> {BASE_URL}/webhook")
    await app.run_webhook(
        listen="0.0.0.0",
        port=PORT,
        url_path="webhook",
        webhook_url=f"{BASE_URL}/webhook",
        drop_pending_updates=True,
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("⏹️ بات متوقف شد.")
    except Exception as e:
        logger.critical(f"💥 خطای مرگبار: {e}", exc_info=True)
        sys.exit(1)
