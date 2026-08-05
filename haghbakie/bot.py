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

def register_user(user_id, username, full_name):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_users (user_id, username, full_name) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET username=%s, full_name=%s", (user_id, username, full_name, username, full_name))
            conn.commit()
    except Exception as e:
        logger.error(f"User Register Error: {e}")

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

# --- Image Generation ---
def create_story_card(story_id):
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM hbk_stories WHERE id = %s", (story_id,))
                s = cur.fetchone()
                cur.execute("SELECT choice, COUNT(*) as count FROM hbk_votes WHERE story_id = %s GROUP BY choice", (story_id,))
                v = cur.fetchall()
        cA = next((x['count'] for x in v if x['choice'] == 'A'), 0)
        cB = next((x['count'] for x in v if x['choice'] == 'B'), 0)
        total = cA + cB
        pA = int(cA/total*100) if total > 0 else 50
        img = Image.new('RGB', (800, 800), color=(20, 20, 30))
        d = ImageDraw.Draw(img)
        d.rectangle([50, 400, 50 + (pA * 7), 450], fill=(0, 200, 100))
        d.rectangle([50 + (pA * 7), 400, 750, 450], fill=(200, 50, 50))
        bio = io.BytesIO()
        img.save(bio, 'PNG')
        bio.seek(0)
        return bio
    except Exception as e:
        logger.error(f"Image Error: {e}")
        return None

# --- Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    register_user(user.id, user.username, user.full_name)
    if context.args and context.args[0].startswith("story_"):
        return await show_story(update, context, context.args[0].split("_")[1])
    kb = [["⚖️ ثبت پرونده جدید"], ["🔥 پرونده‌های داغ", "🎲 پرونده تصادفی"], ["🏆 جدول برترین‌ها"]]
    await update.message.reply_text(f"سلام {user.first_name}! خوش اومدی ⚖️", reply_markup=ReplyKeyboardMarkup(kb, resize_keyboard=True))
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
    preview = f"🔖 **{title}**\n\n📝 {context.user_data['story_content']}\n\n✅ تایید نهایی؟"
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
    pA, pB = (cA/total*100, cB/total*100) if total > 0 else (50,50)
    txt = f"⚖️ **{s['title']}**\n\n📝 {s['content']}\n\n📊 آمار:\n{s['side_a']}: {pA:.1f}%\n{s['side_b']}: {pB:.1f}%\n\n🤖 **نظر قاضی:**\n_{s['ai_verdict']}_"
    kb = [[InlineKeyboardButton(f"حق با {s['side_a']}", callback_data=f"v_{story_id}_A"), InlineKeyboardButton(f"حق با {s['side_b']}", callback_data=f"v_{story_id}_B")],
          [InlineKeyboardButton("📸 کارت استوری", callback_data=f"card_{story_id}")]]
    if update.callback_query: await update.callback_query.edit_message_text(txt, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
    else: await update.message.reply_text(txt, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)

async def handle_vote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    _, s_id, choice = query.data.split("_")
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_votes (story_id, voter_id, choice) VALUES (%s, %s, %s)", (s_id, update.effective_user.id, choice))
                cur.execute("UPDATE hbk_users SET points = points + 2 WHERE user_id = %s", (update.effective_user.id,))
            conn.commit()
        await query.answer("✅ ثبت شد!")
    except:
        await query.answer("❌ قبلاً رأی دادی!", show_alert=True)
    await show_story(update, context, s_id)

async def list_hot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, title FROM hbk_stories ORDER BY created_at DESC LIMIT 5")
            stories = cur.fetchall()
    if not stories: return await update.message.reply_text("هنوز پرونده‌ای ثبت نشده.")
    kb = [[InlineKeyboardButton(s['title'], callback_data=f"view_{s['id']}")] for s in stories]
    await update.message.reply_text("🔥 آخرین پرونده‌ها:", reply_markup=InlineKeyboardMarkup(kb))

async def leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT full_name, points FROM hbk_users ORDER BY points DESC LIMIT 10")
            users = cur.fetchall()
    txt = "🏆 **جدول برترین قضات:**\n\n"
    for i, u in enumerate(users, 1): txt += f"{i}. {u['full_name']} — {u['points']} امتیاز\n"
    await update.message.reply_text(txt)

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
    app.add_handler(MessageHandler(filters.Regex("^🔥 پرونده‌های داغ$"), list_hot))
    app.add_handler(MessageHandler(filters.Regex("^🏆 جدول برترین‌ها$"), leaderboard))
    app.add_handler(MessageHandler(filters.Regex("^🎲 پرونده تصادفی$"), lambda u,c: show_story(u,c,random.randint(1,100))))
    app.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit)],
        states={SUBMIT_STORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_content)],
                SUBMIT_SIDE_A: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a)],
                SUBMIT_SIDE_B: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b)],
                CONFIRM_STORY: [CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$")]},
        fallbacks=[CommandHandler("cancel", lambda u,c: ConversationHandler.END), CommandHandler("start", start)]
    ))
    app.add_handler(CallbackQueryHandler(handle_vote, pattern="^v_"))
    app.add_handler(CallbackQueryHandler(lambda u,c: u.message.reply_photo(create_story_card(u.callback_query.data.split('_')[1])), pattern="^card_"))
    app.add_handler(CallbackQueryHandler(lambda u,c: show_story(u,c,u.callback_query.data.split('_')[1]), pattern="^view_"))
    logger.info(f"[{INSTANCE_ID}] Bot Started!")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
