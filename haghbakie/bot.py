import os
import logging
import asyncio
import threading
import requests
import io
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

# --- Configuration ---
BOT_TOKEN = "8790569799:AAFZuVDuVg62v87yQqmaQy3LS_w71-Q6yz0"
DATABASE_URL = "postgresql://neondb_owner:npg_fLk5QncJezR8@ep-lucky-queen-adg9b8qq-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.environ.get("PORT", 8000))
# Render Public URL
BASE_URL = "https://haghbakie-official.onrender.com"

# States
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY = range(4)

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_users (user_id BIGINT PRIMARY KEY, username TEXT, full_name TEXT, points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_stories (id SERIAL PRIMARY KEY, creator_id BIGINT REFERENCES hbk_users(user_id), title TEXT, content TEXT NOT NULL, side_a TEXT DEFAULT 'من', side_b TEXT DEFAULT 'طرف مقابل', ai_verdict TEXT, category TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_votes (id SERIAL PRIMARY KEY, story_id INTEGER REFERENCES hbk_stories(id), voter_id BIGINT REFERENCES hbk_users(user_id), choice CHAR(1), UNIQUE(story_id, voter_id))")
        conn.commit()

def ensure_user(user):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO hbk_users (user_id, username, full_name) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET username=%s, full_name=%s", 
                       (user.id, user.username, user.full_name, user.username, user.full_name))
        conn.commit()

def ai_analyze_story(content):
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    prompt = f"Analyze this story. Create a catchy title and 2-sentence verdict in Persian. Format: TITLE: [title] | VERDICT: [verdict]. Story: {content}"
    try:
        response = requests.post(url, headers=headers, json={"messages": [{"role": "user", "content": prompt}], "model": "llama3-8b-8192"}, timeout=15)
        resp = response.json()['choices'][0]['message']['content']
        parts = resp.split('|')
        return parts[0].replace('TITLE:', '').strip(), parts[1].replace('VERDICT:', '').strip()
    except:
        return "داستان جدید", "قاضی هوشمند در دسترس نیست."

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_user(update.effective_user)
    kb = [["⚖️ ثبت پرونده جدید"], ["🔥 پرونده‌های داغ", "🎲 پرونده تصادفی"], ["🏆 جدول برترین‌ها"]]
    await update.message.reply_text("⚖️ به دادگاه «حق با کیه؟» خوش آمدید!", reply_markup=ReplyKeyboardMarkup(kb, resize_keyboard=True))
    return ConversationHandler.END

async def start_submit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⚖️ داستان خود را بنویسید:")
    return SUBMIT_STORY

async def get_content(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['story_content'] = update.message.text
    await update.message.reply_text("طرف اول کیست؟")
    return SUBMIT_SIDE_A

async def get_side_a(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_a'] = update.message.text
    await update.message.reply_text("طرف دوم کیست؟")
    return SUBMIT_SIDE_B

async def get_side_b(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_b'] = update.message.text
    title, verdict = ai_analyze_story(context.user_data['story_content'])
    context.user_data['ai'] = {'title': title, 'verdict': verdict}
    preview = f"🔖 **{title}**\n📝 {context.user_data['story_content']}\n\n✅ تایید؟"
    kb = [[InlineKeyboardButton("✅ تایید", callback_data="confirm_story"), InlineKeyboardButton("❌ لغو", callback_data="cancel_story")]]
    await update.message.reply_text(preview, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
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
        await query.edit_message_text(f"✅ منتشر شد!\nhttps://t.me/{(await context.bot.get_me()).username}?start=story_{s_id}")
    return ConversationHandler.END

async def list_hot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, title FROM hbk_stories ORDER BY created_at DESC LIMIT 5")
            res = cur.fetchall()
    if not res: return await update.message.reply_text("پرونده‌ای نیست.")
    kb = [[InlineKeyboardButton(r['title'], callback_data=f"view_{r['id']}")] for r in res]
    await update.message.reply_text("🔥 جدیدترین‌ها:", reply_markup=InlineKeyboardMarkup(kb))

async def handle_vote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    _, s_id, choice = query.data.split("_")
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_votes (story_id, voter_id, choice) VALUES (%s, %s, %s)", (s_id, update.effective_user.id, choice))
            conn.commit()
        await query.answer("✅ ثبت شد!")
    except:
        await query.answer("❌ قبلاً رأی دادی!")

def main():
    init_db()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.Regex("^🔥 پرونده‌های داغ$"), list_hot))
    app.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit)],
        states={SUBMIT_STORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_content)],
                SUBMIT_SIDE_A: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a)],
                SUBMIT_SIDE_B: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b)],
                CONFIRM_STORY: [CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$")]},
        fallbacks=[CommandHandler("start", start)]
    ))
    app.add_handler(CallbackQueryHandler(handle_vote, pattern="^v_"))
    
    # ULTIMATE FIX: Webhook instead of Polling
    # This prevents the "Conflict" error forever.
    webhook_url = f"{BASE_URL}/{BOT_TOKEN.split(':')[0]}"
    app.run_webhook(
        listen="0.0.0.0",
        port=PORT,
        url_path=BOT_TOKEN.split(':')[0],
        webhook_url=webhook_url
    )

if __name__ == "__main__":
    main()
