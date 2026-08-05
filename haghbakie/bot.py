import os
import logging
import asyncio
import threading
import time
import requests
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
import psycopg2
from psycopg2.extras import RealDictCursor
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    filters,
    ContextTypes,
)

# Configuration
BOT_TOKEN = "8790569799:AAFZuVDuVg62v87yQqmaQy3LS_w71-Q6yz0"
DATABASE_URL = "postgresql://neondb_owner:npg_fLk5QncJezR8@ep-lucky-queen-adg9b8qq-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
PORT = int(os.environ.get("PORT", 8000))
ADMIN_IDS = [248175860]
APP_URL = "https://haghbakie-official.onrender.com" # نام جدید سرویس

# States
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY = range(4)

# Logging
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

# DB Helpers
def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_users (user_id BIGINT PRIMARY KEY, username TEXT, full_name TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_stories (id SERIAL PRIMARY KEY, creator_id BIGINT REFERENCES hbk_users(user_id), content TEXT NOT NULL, side_a TEXT DEFAULT 'من', side_b TEXT DEFAULT 'طرف مقابل', status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_votes (id SERIAL PRIMARY KEY, story_id INTEGER REFERENCES hbk_stories(id), voter_id BIGINT REFERENCES hbk_users(user_id), choice CHAR(1), UNIQUE(story_id, voter_id))")
        conn.commit()

def register_user(user_id, username, full_name):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_users (user_id, username, full_name) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET username=%s, full_name=%s", (user_id, username, full_name, username, full_name))
            conn.commit()
    except Exception as e:
        logger.error(f"DB Error: {e}")

# --- Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    register_user(user.id, user.username, user.full_name)
    
    if context.args and context.args[0].startswith("story_"):
        return await show_story(update, context, context.args[0].split("_")[1])

    keyboard = [["⚖️ ثبت پرونده جدید"], ["🔥 پرونده‌های داغ"]]
    await update.message.reply_text(f"سلام {user.first_name}! به «حق با کیه؟» خوش اومدی. ⚖️", reply_markup=ReplyKeyboardMarkup(keyboard, resize_keyboard=True))

async def start_submit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("داستانت رو کوتاه بنویس:")
    return SUBMIT_STORY

async def get_content(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['story_content'] = update.message.text
    await update.message.reply_text("طرف اول کیه؟ (مثلاً: من)")
    return SUBMIT_SIDE_A

async def get_side_a(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_a'] = update.message.text
    await update.message.reply_text("طرف دوم کیه؟ (مثلاً: دوستم)")
    return SUBMIT_SIDE_B

async def get_side_b(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_b'] = update.message.text
    preview = f"⚖️ **تایید نهایی:**\n\n📝 {context.user_data['story_content']}\n\n1️⃣ {context.user_data['side_a']}\n2️⃣ {context.user_data['side_b']}"
    keyboard = [[InlineKeyboardButton("✅ تایید", callback_data="confirm_story"), InlineKeyboardButton("❌ لغو", callback_data="cancel_story")]]
    await update.message.reply_text(preview, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    return CONFIRM_STORY

async def confirm_story(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "confirm_story":
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_stories (creator_id, content, side_a, side_b, expires_at) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (update.effective_user.id, context.user_data['story_content'], context.user_data['side_a'], context.user_data['side_b'], datetime.now() + timedelta(hours=24)))
                s_id = cur.fetchone()['id']
            conn.commit()
        link = f"https://t.me/{(await context.bot.get_me()).username}?start=story_{s_id}"
        await query.edit_message_text(f"✅ ثبت شد!\n🔗 لینک رأی‌گیری:\n{link}")
    else:
        await query.edit_message_text("❌ لغو شد.")
    return ConversationHandler.END

async def show_story(update: Update, context: ContextTypes.DEFAULT_TYPE, story_id):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM hbk_stories WHERE id = %s", (story_id,))
            s = cur.fetchone()
            if not s: return
            cur.execute("SELECT choice, COUNT(*) as count FROM hbk_votes WHERE story_id = %s GROUP BY choice", (story_id,))
            v = cur.fetchall()
    
    cA = next((x['count'] for x in v if x['choice'] == 'A'), 0)
    cB = next((x['count'] for x in v if x['choice'] == 'B'), 0)
    total = cA + cB
    pA, pB = (cA/total*100, cB/total*100) if total > 0 else (0,0)
    
    txt = f"⚖️ **حق با کیه؟**\n\n📝 {s['content']}\n\n📊 آمار:\n{s['side_a']}: {pA:.1f}%\n{s['side_b']}: {pB:.1f}%"
    kb = [[InlineKeyboardButton(s['side_a'], callback_data=f"v_{story_id}_A"), InlineKeyboardButton(s['side_b'], callback_data=f"v_{story_id}_B")]]
    
    if update.callback_query: await query.edit_message_text(txt, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")
    else: await update.message.reply_text(txt, reply_markup=InlineKeyboardMarkup(kb), parse_mode="Markdown")

async def handle_vote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    _, s_id, choice = query.data.split("_")
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_votes (story_id, voter_id, choice) VALUES (%s, %s, %s)", (s_id, update.effective_user.id, choice))
            conn.commit()
        await query.answer("ثبت شد!")
    except:
        await query.answer("قبلاً رأی دادی!", show_alert=True)
    await show_story(update, context, s_id)

# --- Server & Keep Alive ---
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b"OK")
    def log_message(self, format, *args): return

def run_server():
    HTTPServer(('0.0.0.0', PORT), HealthHandler).serve_forever()

def keep_alive():
    while True:
        try: requests.get(APP_URL, timeout=10)
        except: pass
        time.sleep(600)

# --- Main ---
def main():
    init_db()
    threading.Thread(target=run_server, daemon=True).start()
    threading.Thread(target=keep_alive, daemon=True).start()
    
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit)],
        states={SUBMIT_STORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_content)],
                SUBMIT_SIDE_A: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a)],
                SUBMIT_SIDE_B: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b)],
                CONFIRM_STORY: [CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$")]},
        fallbacks=[CommandHandler("cancel", lambda u,c: ConversationHandler.END)]
    ))
    app.add_handler(CallbackQueryHandler(handle_vote, pattern="^v_"))
    logger.info("Bot Started...")
    app.run_polling()

if __name__ == "__main__":
    main()
