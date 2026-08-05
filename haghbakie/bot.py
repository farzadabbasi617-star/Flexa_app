import os
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
# ⚠️ مقادیر حساس باید در Environment Variables رندر تنظیم شوند
BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
PORT = int(os.environ.get("PORT", "8000"))
BASE_URL = os.getenv("BASE_URL", "https://haghbakie-official.onrender.com").strip()
OWNER_ID = int(os.getenv("OWNER_ID", "248175860"))

# بررسی وجود مقادیر ضروری در startup
if not BOT_TOKEN:
    raise RuntimeError("❌ BOT_TOKEN در Environment Variables تنظیم نشده است!")
if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL در Environment Variables تنظیم نشده است!")

# ===================== حالات مکالمه =====================
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY = range(4)
VOTE_CHOICE = range(4, 5)

# ===================== لاگینگ =====================
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# ===================== دیتابیس =====================
# استفاده از Connection Pool برای مدیریت بهتر اتصالات
db_pool = None

def init_db_pool():
    global db_pool
    if db_pool is None:
        db_pool = ThreadedConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=DATABASE_URL
        )
    return db_pool

def get_db_conn():
    """دریافت یک اتصال از pool"""
    pool = init_db_pool()
    return pool.getconn()

def return_db_conn(conn):
    """برگرداندن اتصال به pool"""
    if db_pool and conn:
        db_pool.putconn(conn)

class DBCursor:
    """Context manager برای cursor با RealDictCursor"""
    def __init__(self, conn):
        self.conn = conn
        self.cur = None

    def __enter__(self):
        self.cur = self.conn.cursor(cursor_factory=RealDictCursor)
        return self.cur

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cur.close()

def init_db():
    """ایجاد جداول در صورت عدم وجود + migration ستون‌های جدید"""
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            # جداول اصلی
            cur.execute("""
                CREATE TABLE IF NOT EXISTS hbk_users (
                    user_id BIGINT PRIMARY KEY,
                    username TEXT,
                    full_name TEXT,
                    points INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS hbk_stories (
                    id SERIAL PRIMARY KEY,
                    creator_id BIGINT REFERENCES hbk_users(user_id),
                    title TEXT,
                    content TEXT NOT NULL,
                    side_a TEXT DEFAULT 'من',
                    side_b TEXT DEFAULT 'طرف مقابل',
                    ai_verdict TEXT,
                    category TEXT,
                    status TEXT DEFAULT 'active',
                    votes_a INTEGER DEFAULT 0,
                    votes_b INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS hbk_votes (
                    id SERIAL PRIMARY KEY,
                    story_id INTEGER REFERENCES hbk_stories(id),
                    voter_id BIGINT REFERENCES hbk_users(user_id),
                    choice CHAR(1),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(story_id, voter_id)
                )
            """)

            # Migration: اضافه کردن ستون‌های جدید به جداول قدیمی
            # votes_a, votes_b برای hbk_stories
            for col, col_type in [
                ("votes_a", "INTEGER DEFAULT 0"),
                ("votes_b", "INTEGER DEFAULT 0"),
            ]:
                try:
                    cur.execute(f"""
                        ALTER TABLE hbk_stories ADD COLUMN IF NOT EXISTS {col} {col_type}
                    """)
                except Exception:
                    pass  # ستون احتمالاً از قبل وجود دارد

            # created_at برای hbk_votes
            try:
                cur.execute("""
                    ALTER TABLE hbk_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                """)
            except Exception:
                pass

            conn.commit()
            logger.info("✅ جداول دیتابیس بررسی و آماده شدند.")
    except Exception as e:
        logger.error(f"❌ خطا در ایجاد جداول: {e}")
        conn.rollback()
        raise
    finally:
        return_db_conn(conn)

def ensure_user(user):
    """ثبت یا بروزرسانی کاربر در دیتابیس"""
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute(
                """INSERT INTO hbk_users (user_id, username, full_name) 
                   VALUES (%s, %s, %s) 
                   ON CONFLICT (user_id) DO UPDATE SET 
                       username = EXCLUDED.username, 
                       full_name = EXCLUDED.full_name""",
                (user.id, user.username or "", user.full_name or "")
            )
        conn.commit()
    except Exception as e:
        logger.error(f"خطا در ثبت کاربر: {e}")
        conn.rollback()
    finally:
        return_db_conn(conn)

# ===================== هوش مصنوعی =====================
def ai_analyze_story(content: str, side_a: str = "من", side_b: str = "طرف مقابل"):
    """تحلیل داستان با Groq AI و تولید تیتر و نظر کارشناسی"""
    if not GROQ_API_KEY:
        return "داستان جدید", "🤖 قاضی هوشمند در حال حاضر در دسترس نیست."

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    prompt = (
        f"یک داستان کوتاه فارسی درباره یک اختلاف یا درگیری را تحلیل کن. "
        f"طرف اول: {side_a} | طرف دوم: {side_b}\n"
        f"داستان: {content}\n\n"
        f"لطفاً دقیقاً در قالب زیر پاسخ بده و هیچ چیز اضافه‌ای ننویس:\n"
        f"TITLE: [یک تیتر کوتاه و جذاب فارسی max 50 کاراکتر]\n"
        f"VERDICT: [نظر کارشناسی ۱ تا ۲ جمله‌ای فارسی درباره اینکه حق با کدام طرف است]"
    )

    try:
        response = requests.post(
            url,
            headers=headers,
            json={
                "messages": [{"role": "user", "content": prompt}],
                "model": "llama3-8b-8192",
                "temperature": 0.7,
                "max_tokens": 300
            },
            timeout=20
        )
        response.raise_for_status()
        resp_text = response.json()['choices'][0]['message']['content']

        # استخراج تیتر
        title = "داستان جدید"
        verdict = "⚖️ نظر کارشناسی در دسترس نیست."

        for line in resp_text.split('\n'):
            line = line.strip()
            if line.upper().startswith("TITLE:"):
                title = line.split("TITLE:", 1)[1].strip()
                # حذف کاراکترهای غیرمجاز
                title = title.replace("*", "").replace("_", "").replace("`", "")
            elif line.upper().startswith("VERDICT:"):
                verdict = line.split("VERDICT:", 1)[1].strip()

        # اگر تیتر بیش از حد طولانی بود
        if len(title) > 60:
            title = title[:57] + "..."

        return title, verdict

    except requests.exceptions.Timeout:
        logger.warning("⏱️ timeout درخواست Groq")
        return "داستان جدید", "🤖 قاضی هوشمند وقت نکرد نظر بده. لطفاً دوباره تلاش کنید."
    except Exception as e:
        logger.error(f"❌ خطای Groq AI: {e}")
        return "داستان جدید", "🤖 قاضی هوشمند در دسترس نیست. اما رأی‌گیری همچنان فعال است!"

# ===================== کیبورد اصلی =====================
def main_keyboard():
    return ReplyKeyboardMarkup(
        [
            ["⚖️ ثبت پرونده جدید"],
            ["🔥 پرونده‌های داغ", "🎲 پرونده تصادفی"],
            ["🏆 جدول برترین‌ها", "📊 پرونده‌های من"]
        ],
        resize_keyboard=True
    )

# ===================== هندلرها =====================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """دستور /start و هندل deep link"""
    ensure_user(update.effective_user)

    # بررسی deep link برای نمایش پرونده خاص
    if context.args and len(context.args) > 0:
        arg = context.args[0]
        if arg.startswith("story_"):
            try:
                story_id = int(arg.replace("story_", ""))
                return await show_story(update, context, story_id)
            except ValueError:
                pass

    await update.message.reply_text(
        "⚖️ به دادگاه «حق با کیه؟» خوش آمدید!\n\n"
        "📝 داستان اختلاف خود را بنویسید تا دیگران قضاوت کنند.\n"
        "🗳️ یا به پرونده‌های دیگران رأی دهید.\n"
        "🏆 امتیاز جمع کنید و جزو برترین قاضی‌ها شوید!",
        reply_markup=main_keyboard()
    )

async def handle_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """مدیریت دکمه‌های منوی اصلی"""
    text = update.message.text.strip()
    ensure_user(update.effective_user)

    if text == "🔥 پرونده‌های داغ":
        return await hot_stories(update, context)
    elif text == "🎲 پرونده تصادفی":
        return await random_story(update, context)
    elif text == "🏆 جدول برترین‌ها":
        return await leaderboard(update, context)
    elif text == "📊 پرونده‌های من":
        return await my_stories(update, context)
    # "⚖️ ثبت پرونده جدید" توسط ConversationHandler مدیریت می‌شود

async def hot_stories(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """نمایش پرونده‌های داغ (بیشترین رأی)"""
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""
                SELECT s.id, s.title, s.side_a, s.side_b, 
                       s.votes_a + s.votes_b as total_votes,
                       s.created_at
                FROM hbk_stories s
                WHERE s.status = 'active'
                ORDER BY total_votes DESC, s.created_at DESC
                LIMIT 10
            """)
            stories = cur.fetchall()
    finally:
        return_db_conn(conn)

    if not stories:
        await update.message.reply_text("🔍 هنوز هیچ پرونده‌ای ثبت نشده! اولین نفر باشید.", reply_markup=main_keyboard())
        return

    lines = ["🔥 **پرونده‌های داغ:**\n"]
    for i, s in enumerate(stories, 1):
        lines.append(f"{i}. {s['title']} — 🗳 {s['total_votes']} رأی  |  /case_{s['id']}")

    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN)
    await update.message.reply_text("👆 برای مشاهده هر پرونده، روی لینک آن کلیک کنید.", reply_markup=main_keyboard())

async def random_story(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """نمایش یک پرونده تصادفی"""
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""
                SELECT id FROM hbk_stories 
                WHERE status = 'active' 
                ORDER BY RANDOM() LIMIT 1
            """)
            story = cur.fetchone()
    finally:
        return_db_conn(conn)

    if not story:
        await update.message.reply_text("🔍 هنوز هیچ پرونده‌ای ثبت نشده!", reply_markup=main_keyboard())
        return

    await show_story(update, context, story['id'])

async def leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """جدول برترین قاضی‌ها"""
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""
                SELECT user_id, full_name, username, points 
                FROM hbk_users 
                WHERE points > 0 
                ORDER BY points DESC 
                LIMIT 15
            """)
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

    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN, reply_markup=main_keyboard())

async def my_stories(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """پرونده‌های ثبت‌شده توسط کاربر"""
    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""
                SELECT id, title, status, votes_a, votes_b, created_at
                FROM hbk_stories 
                WHERE creator_id = %s 
                ORDER BY created_at DESC 
                LIMIT 10
            """, (update.effective_user.id,))
            stories = cur.fetchall()
    finally:
        return_db_conn(conn)

    if not stories:
        await update.message.reply_text("📭 شما هنوز هیچ پرونده‌ای ثبت نکرده‌اید.", reply_markup=main_keyboard())
        return

    lines = ["📊 **پرونده‌های من:**\n"]
    for s in stories:
        status_emoji = "🟢" if s['status'] == 'active' else "🔴"
        total = (s['votes_a'] or 0) + (s['votes_b'] or 0)
        lines.append(f"{status_emoji} {s['title']} — 🗳 {total} رأی  |  /case_{s['id']}")

    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.MARKDOWN, reply_markup=main_keyboard())

async def show_story(update: Update, context: ContextTypes.DEFAULT_TYPE, story_id: int = None):
    """نمایش یک پرونده خاص برای رأی‌گیری"""
    if story_id is None:
        # فراخوانی از طریق /case_
        if context.args and len(context.args) > 0:
            try:
                story_id = int(context.args[0])
            except ValueError:
                await update.message.reply_text("⚠️ شناسه پرونده نامعتبر است.", reply_markup=main_keyboard())
                return
        else:
            await update.message.reply_text("⚠️ لطفاً شناسه پرونده را وارد کنید.", reply_markup=main_keyboard())
            return

    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            cur.execute("""
                SELECT s.*, u.full_name as creator_name, u.username as creator_username
                FROM hbk_stories s
                JOIN hbk_users u ON s.creator_id = u.user_id
                WHERE s.id = %s
            """, (story_id,))
            story = cur.fetchone()

            if not story:
                await update.message.reply_text("🔍 پرونده مورد نظر یافت نشد.", reply_markup=main_keyboard())
                return

            # بررسی رأی قبلی کاربر
            cur.execute("SELECT choice FROM hbk_votes WHERE story_id = %s AND voter_id = %s",
                       (story_id, update.effective_user.id))
            existing_vote = cur.fetchone()
    finally:
        return_db_conn(conn)

    creator_name = story['creator_name'] or story['creator_username'] or "ناشناس"
    total_a = story['votes_a'] or 0
    total_b = story['votes_b'] or 0
    total_votes = total_a + total_b
    pct_a = round((total_a / total_votes * 100)) if total_votes > 0 else 0
    pct_b = round((total_b / total_votes * 100)) if total_votes > 0 else 0

    text = (
        f"📋 **پرونده #{story['id']}**\n"
        f"🔖 {story['title']}\n\n"
        f"📝 {story['content']}\n\n"
        f"👤 **{story['side_a']}** 🆚 **{story['side_b']}**\n\n"
        f"🤖 نظر کارشناسی:\n{story['ai_verdict']}\n\n"
        f"📊 نتایج:\n"
        f"▫️ {story['side_a']}: {pct_a}% ({total_a} رأی)\n"
        f"▫️ {story['side_b']}: {pct_b}% ({total_b} رأی)\n"
        f"━━━━━━━━━━━━━━\n"
        f"📌 ثبت‌شده توسط: {creator_name}\n"
    )

    if story['status'] != 'active':
        text += "\n⚠️ این پرونده بسته شده است."

    if existing_vote:
        text += f"\n\n✅ شما قبلاً به **{story['side_a'] if existing_vote['choice'] == 'A' else story['side_b']}** رأی داده‌اید."

    kb = []
    if story['status'] == 'active' and not existing_vote:
        kb = [[
            InlineKeyboardButton(f"🤚 {story['side_a']}", callback_data=f"vote_{story_id}_A"),
            InlineKeyboardButton(f"🤚 {story['side_b']}", callback_data=f"vote_{story_id}_B")
        ]]

    if update.callback_query:
        if kb:
            await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
        else:
            await update.callback_query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN)
    else:
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(kb) if kb else None,
            parse_mode=ParseMode.MARKDOWN
        )

async def case_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """دستور /case_123 برای نمایش پرونده"""
    await show_story(update, context)

async def handle_vote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """مدیریت رأی‌گیری"""
    query = update.callback_query
    await query.answer()

    data = query.data  # مثلاً: vote_5_A
    if not data.startswith("vote_"):
        return

    parts = data.split("_")
    story_id = int(parts[1])
    choice = parts[2]  # 'A' یا 'B'

    conn = get_db_conn()
    try:
        with DBCursor(conn) as cur:
            # بررسی وجود پرونده و فعال بودن
            cur.execute("SELECT * FROM hbk_stories WHERE id = %s AND status = 'active'", (story_id,))
            story = cur.fetchone()
            if not story:
                await query.edit_message_text("⚠️ این پرونده دیگر فعال نیست.", parse_mode=ParseMode.MARKDOWN)
                return

            # ثبت رأی
            try:
                cur.execute(
                    "INSERT INTO hbk_votes (story_id, voter_id, choice) VALUES (%s, %s, %s)",
                    (story_id, update.effective_user.id, choice)
                )
                # بروزرسانی شمارنده
                if choice == 'A':
                    cur.execute("UPDATE hbk_stories SET votes_a = votes_a + 1 WHERE id = %s", (story_id,))
                else:
                    cur.execute("UPDATE hbk_stories SET votes_b = votes_b + 1 WHERE id = %s", (story_id,))

                # افزودن امتیاز به رأی‌دهنده
                cur.execute(
                    "UPDATE hbk_users SET points = points + 10 WHERE user_id = %s",
                    (update.effective_user.id,)
                )
                # افزودن امتیاز به صاحب پرونده
                cur.execute(
                    "UPDATE hbk_users SET points = points + 5 WHERE user_id = %s",
                    (story['creator_id'],)
                )
                conn.commit()

                side_name = story['side_a'] if choice == 'A' else story['side_b']
                await query.answer(f"✅ شما به {side_name} رأی دادید!", show_alert=False)

            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                await query.answer("⚠️ شما قبلاً رأی داده‌اید!", show_alert=True)
                return

            # نمایش دوباره پرونده با نتایج جدید
            cur.execute("""
                SELECT s.*, u.full_name as creator_name, u.username as creator_username
                FROM hbk_stories s
                JOIN hbk_users u ON s.creator_id = u.user_id
                WHERE s.id = %s
            """, (story_id,))
            story = cur.fetchone()
    finally:
        return_db_conn(conn)

    if not story:
        return

    total_a = story['votes_a'] or 0
    total_b = story['votes_b'] or 0
    total_votes = total_a + total_b
    pct_a = round((total_a / total_votes * 100)) if total_votes > 0 else 0
    pct_b = round((total_b / total_votes * 100)) if total_votes > 0 else 0
    creator_name = story['creator_name'] or story['creator_username'] or "ناشناس"

    text = (
        f"📋 **پرونده #{story['id']}**\n"
        f"🔖 {story['title']}\n\n"
        f"📝 {story['content']}\n\n"
        f"👤 **{story['side_a']}** 🆚 **{story['side_b']}**\n\n"
        f"🤖 نظر کارشناسی:\n{story['ai_verdict']}\n\n"
        f"📊 نتایج:\n"
        f"▫️ {story['side_a']}: {pct_a}% ({total_a} رأی)\n"
        f"▫️ {story['side_b']}: {pct_b}% ({total_b} رأی)\n"
        f"━━━━━━━━━━━━━━\n"
        f"📌 ثبت‌شده توسط: {creator_name}\n\n"
        f"✅ رأی شما ثبت شد! 🎉"
    )

    await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN)

# ===================== ثبت پرونده جدید =====================
async def start_submit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "⚖️ **ثبت پرونده جدید**\n\n"
        "📝 داستان اختلاف یا درگیری خود را کامل توضیح دهید.\n"
        "هرچه دقیق‌تر بنویسید، دیگران بهتر قضاوت می‌کنند.\n\n"
        "برای لغو: /cancel",
        parse_mode=ParseMode.MARKDOWN
    )
    return SUBMIT_STORY

async def get_content(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['story_content'] = update.message.text.strip()

    if len(context.user_data['story_content']) < 20:
        await update.message.reply_text("⚠️ لطفاً توضیحات بیشتری بنویسید (حداقل ۲۰ کاراکتر). برای لغو: /cancel")
        return SUBMIT_STORY

    await update.message.reply_text("👤 طرف اول دعوا کیست؟\n(مثلاً: من، شوهرم، همکارم، دوستم)\nبرای لغو: /cancel")
    return SUBMIT_SIDE_A

async def get_side_a(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_a'] = update.message.text.strip()
    await update.message.reply_text("👤 طرف دوم دعوا کیست؟\n(مثلاً: همسرم، رئیسم، خواهرم)\nبرای لغو: /cancel")
    return SUBMIT_SIDE_B

async def get_side_b(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_b'] = update.message.text.strip()

    # پیام "در حال تحلیل..."
    wait_msg = await update.message.reply_text("🤖 در حال تحلیل پرونده توسط قاضی هوشمند...")

    title, verdict = ai_analyze_story(
        context.user_data['story_content'],
        context.user_data['side_a'],
        context.user_data['side_b']
    )
    context.user_data['ai'] = {'title': title, 'verdict': verdict}

    await wait_msg.delete()

    preview = (
        f"🔖 **{title}**\n\n"
        f"📝 {context.user_data['story_content']}\n\n"
        f"👤 {context.user_data['side_a']} 🆚 {context.user_data['side_b']}\n\n"
        f"🤖 **نظر کارشناسی:**\n{verdict}\n\n"
        f"✅ آیا پرونده ثبت شود؟"
    )

    kb = [[
        InlineKeyboardButton("✅ تایید و انتشار", callback_data="confirm_story"),
        InlineKeyboardButton("❌ لغو", callback_data="cancel_story")
    ]]
    await update.message.reply_text(preview, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
    return CONFIRM_STORY

async def confirm_story(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == "confirm_story":
        conn = get_db_conn()
        try:
            with DBCursor(conn) as cur:
                cur.execute(
                    """INSERT INTO hbk_stories 
                       (creator_id, title, content, side_a, side_b, ai_verdict, expires_at) 
                       VALUES (%s, %s, %s, %s, %s, %s, %s) 
                       RETURNING id""",
                    (
                        update.effective_user.id,
                        context.user_data['ai']['title'],
                        context.user_data['story_content'],
                        context.user_data['side_a'],
                        context.user_data['side_b'],
                        context.user_data['ai']['verdict'],
                        datetime.now() + timedelta(hours=48)  # ۴۸ ساعت
                    )
                )
                s_id = cur.fetchone()['id']
            conn.commit()
        except Exception as e:
            logger.error(f"خطا در ثبت پرونده: {e}")
            conn.rollback()
            await query.edit_message_text("❌ خطا در ثبت پرونده. لطفاً دوباره تلاش کنید.")
            return ConversationHandler.END
        finally:
            return_db_conn(conn)

        bot_username = (await context.bot.get_me()).username
        link = f"https://t.me/{bot_username}?start=story_{s_id}"

        success_text = (
            f"✅ **پرونده با موفقیت ثبت شد!**\n\n"
            f"🔖 {context.user_data['ai']['title']}\n"
            f"🆔 شماره پرونده: #{s_id}\n\n"
            f"🔗 لینک اشتراک‌گذاری:\n{link}\n\n"
            f"⏰ این پرونده به مدت ۴۸ ساعت باز است."
        )
        await query.edit_message_text(success_text, parse_mode=ParseMode.MARKDOWN)
        # پاک کردن داده‌های موقت
        context.user_data.clear()
    else:
        await query.edit_message_text("❌ ثبت پرونده لغو شد.", reply_markup=main_keyboard())
        context.user_data.clear()

    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """لغو عملیات جاری"""
    context.user_data.clear()
    await update.message.reply_text("🚫 عملیات لغو شد.", reply_markup=main_keyboard())
    return ConversationHandler.END

# ===================== مدیریت خطا =====================
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """مدیریت خطاهای سراسری"""
    logger.error("Exception while handling an update:", exc_info=context.error)

    if isinstance(context.error, TelegramError):
        logger.error(f"TelegramError: {context.error}")
    else:
        try:
            if update and hasattr(update, 'effective_chat'):
                await context.bot.send_message(
                    chat_id=update.effective_chat.id,
                    text="❌ متأسفانه خطایی رخ داد. لطفاً دوباره تلاش کنید."
                )
        except:
            pass

# ===================== راه‌اندازی =====================
async def main():
    """تابع اصلی راه‌اندازی بات"""
    # آماده‌سازی دیتابیس
    logger.info("🔄 در حال آماده‌سازی دیتابیس...")
    init_db()

    # ساخت Application
    app = Application.builder().token(BOT_TOKEN).build()

    # ========== هندلرها ==========

    # دستور /start
    app.add_handler(CommandHandler("start", start))

    # نمایش پرونده با /case_123
    app.add_handler(CommandHandler("case", case_command))

    # دکمه‌های منو (بدون "ثبت پرونده جدید" که توسط ConversationHandler مدیریت می‌شود)
    app.add_handler(MessageHandler(
        filters.TEXT & filters.Regex(
            r"^(🔥 پرونده‌های داغ|🎲 پرونده تصادفی|🏆 جدول برترین‌ها|📊 پرونده‌های من)$"
        ),
        handle_menu
    ))

    # ثبت پرونده جدید (Conversation)
    conv_handler = ConversationHandler(
        entry_points=[
            MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit),
        ],
        states={
            SUBMIT_STORY: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, get_content),
            ],
            SUBMIT_SIDE_A: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a),
            ],
            SUBMIT_SIDE_B: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b),
            ],
            CONFIRM_STORY: [
                CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$"),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", cancel),
            CommandHandler("start", start),
        ],
        allow_reentry=True,
    )
    app.add_handler(conv_handler)

    # رأی‌گیری
    app.add_handler(CallbackQueryHandler(handle_vote, pattern=r"^vote_\d+_[AB]$"))

    # مدیریت خطا
    app.add_error_handler(error_handler)

    # ========== اجرا با Webhook ==========
    logger.info(f"🚀 بات در حال راه‌اندازی روی پورت {PORT}...")
    logger.info(f"📍 Webhook URL: {BASE_URL}/webhook")

    await app.run_webhook(
        listen="0.0.0.0",
        port=PORT,
        url_path="webhook",
        webhook_url=f"{BASE_URL}/webhook",
        drop_pending_updates=True,
    )

if __name__ == "__main__":
    asyncio.run(main())
