import os
import logging
import asyncio
import threading
import time
import requests
import io
import random
import string
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
import psycopg2
from psycopg2.extras import RealDictCursor
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler, 
    ConversationHandler, filters, ContextTypes
)
from telegram.constants import ParseMode
from PIL import Image, ImageDraw

# --- Unique Instance ID for Debugging ---
INSTANCE_ID = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))

# Configuration
BOT_TOKEN = "8790569799:AAFZuVDuVg62v87yQqmaQy3LS_w71-Q6yz0"
DATABASE_URL = "postgresql://neondb_owner:npg_fLk5QncJezR8@ep-lucky-queen-adg9b8qq-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.environ.get("PORT", 8000))

# States
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY = range(4)

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Database Helpers ---
def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_users (user_id BIGINT PRIMARY KEY, username TEXT, full_name TEXT, points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_stories (id SERIAL PRIMARY KEY, creator_id BIGINT REFERENCES hbk_users(user_id), title TEXT, content TEXT NOT NULL, side_a TEXT DEFAULT 'من', side_b TEXT DEFAULT 'طرف مقابل', ai_verdict TEXT, category TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_votes (id SERIAL PRIMARY KEY, story_id INTEGER REFERENCES hbk_stories(id), voter_id BIGINT REFERENCES hbk_users(user_id), choice CHAR(1), UNIQUE(story_id, voter_id))")
        conn.commit()

# --- AI Logic ---
def ai_analyze_story(content):
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    prompt = f"Analyze this story for a 'Whos Right?' court. Create a catchy short title and a 2-sentence verdict in Persian. Format: TITLE: [title] | VERDICT: [verdict]. Story: {content}"
    try:
        response = requests.post(url, headers=headers, json={"messages": [{"role": "user", "content": prompt}], "model": "llama3-8b-8192"}, timeout=15)
        resp = response.json()['choices'][0]['message']['content']
        parts = resp.split('|')
        return parts[0].replace('TITLE:', '').strip(), parts[1].replace('VERDICT:', '').strip()
    except:
        return "داستان جدید", "قاضی هوشمند فعلاً در دسترس نیست."

# --- Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    logger.info(f"[{INSTANCE_ID}] Start command from {user.id}")
    kb = [["⚖️ ثبت پرونده جدید"], ["🔥 پرونده‌های داغ", "🎲 پرونده تصادفی"]]
    await update.message.reply_text(f"سلام {user.first_name}! من قاضی هستم (کد سرور: {INSTANCE_ID})\nاز منو استفاده کن:", reply_markup=ReplyKeyboardMarkup(kb, resize_keyboard=True))

async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.message.reply_text("✅ وضعیت شما ریست شد. دوباره /start بزنید.")
    return ConversationHandler.END

async def start_submit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⚖️ داستانت رو بنویس:")
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
    msg = await update.message.reply_text("🤖 تحلیل هوش مصنوعی...")
    title, verdict = ai_analyze_story(context.user_data['story_content'])
    context.user_data['ai'] = {'title': title, 'verdict': verdict}
    preview = f"🔖 **{title}**\n\n📝 {context.user_data['story_content']}\n\n✅ تایید نهایی برای انتشار؟"
    kb = [[InlineKeyboardButton("✅ تایید", callback_data="confirm_story"), InlineKeyboardButton("❌ لغو", callback_data="cancel_story")]]
    await msg.edit_text(preview, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
    return CONFIRM_STORY

async def confirm_story(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "confirm_story":
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_stories (creator_id, title, content, side_a, side_b, ai_verdict, expires_at) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                    (update.effective_user.id, context.user_data['ai']['title'], context.user_data['story_content'], context.user_data['side_a'], context.user_data['side_b'], context.user_data['ai']['verdict'], datetime.now() + timedelta(hours=24)))
                s_id = cur.fetchone()['id']
            conn.commit()
        await query.edit_message_text(f"✅ ثبت شد! لینک رأی‌گیری:\nhttps://t.me/{(await context.bot.get_me()).username}?start=story_{s_id}")
    else:
        await query.edit_message_text("❌ لغو شد.")
    return ConversationHandler.END

# --- Server ---
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self): self.send_response(200); self.end_headers(); self.wfile.write(b"OK")
    def log_message(self, format, *args): return

def run_server():
    HTTPServer(('0.0.0.0', PORT), HealthHandler).serve_forever()

def main():
    init_db()
    threading.Thread(target=run_server, daemon=True).start()
    app = Application.builder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("reset", reset))
    
    app.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit)],
        states={SUBMIT_STORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_content)],
                SUBMIT_SIDE_A: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a)],
                SUBMIT_SIDE_B: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b)],
                CONFIRM_STORY: [CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$")]},
        fallbacks=[CommandHandler("cancel", lambda u,c: ConversationHandler.END)]
    ))
    
    logger.info(f"[{INSTANCE_ID}] Bot is booting up...")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
