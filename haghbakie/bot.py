import os
import logging
import asyncio
import threading
import time
import requests
import io
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
import psycopg2
from psycopg2.extras import RealDictCursor
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, InputFile
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler, 
    ConversationHandler, filters, ContextTypes, Defaults
)
from telegram.constants import ParseMode
from groq import Groq
from PIL import Image, ImageDraw, ImageFont

# --- Configuration ---
BOT_TOKEN = "8790569799:AAFZuVDuVg62v87yQqmaQy3LS_w71-Q6yz0"
DATABASE_URL = "postgresql://neondb_owner:npg_fLk5QncJezR8@ep-lucky-queen-adg9b8qq-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PORT = int(os.environ.get("PORT", 8000))
ADMIN_IDS = [248175860]

# AI Client
groq_client = Groq(api_key=GROQ_API_KEY)

# States
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY, SUBMIT_COMMENT = range(5)

# Logging
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Database Helpers ---
def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_users (user_id BIGINT PRIMARY KEY, username TEXT, full_name TEXT, points INTEGER DEFAULT 0, badges TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_stories (id SERIAL PRIMARY KEY, creator_id BIGINT REFERENCES hbk_users(user_id), title TEXT, content TEXT NOT NULL, side_a TEXT DEFAULT 'من', side_b TEXT DEFAULT 'طرف مقابل', ai_verdict TEXT, category TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP)")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_votes (id SERIAL PRIMARY KEY, story_id INTEGER REFERENCES hbk_stories(id), voter_id BIGINT REFERENCES hbk_users(user_id), choice CHAR(1), UNIQUE(story_id, voter_id))")
            cur.execute("CREATE TABLE IF NOT EXISTS hbk_comments (id SERIAL PRIMARY KEY, story_id INTEGER REFERENCES hbk_stories(id), user_id BIGINT REFERENCES hbk_users(user_id), comment_text TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.commit()

def register_user(user_id, username, full_name):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO hbk_users (user_id, username, full_name) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET username=%s, full_name=%s", (user_id, username, full_name, username, full_name))
        conn.commit()

# --- AI Logic (Groq) ---
def ai_analyze_story(content):
    prompt = f"""
    Analyze this story for a 'Whos Right?' court. 
    1. Create a very catchy, short clickbait title in Persian.
    2. Provide a 2-sentence moral verdict in Persian (who is likely right based on ethics).
    3. Categorize it (Family, Friends, Money, Love, Work).
    Format as: TITLE: [title] | VERDICT: [verdict] | CATEGORY: [cat]
    Story: {content}
    """
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
        )
        resp = chat_completion.choices[0].message.content
        parts = resp.split('|')
        title = parts[0].replace('TITLE:', '').strip()
        verdict = parts[1].replace('VERDICT:', '').strip()
        cat = parts[2].replace('CATEGORY:', '').strip()
        return title, verdict, cat
    except:
        return "داستان جدید", "هوش مصنوعی در حال استراحت است!", "عمومی"

# --- Image Generation (Pillow) ---
def create_story_card(story_id):
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
    pB = 100 - pA

    # Simple Dark Template
    img = Image.new('RGB', (1080, 1080), color=(15, 15, 25))
    d = ImageDraw.Draw(img)
    
    # Simple Graphics (Render might not have Farsi fonts, so we use shapes/English for safety)
    d.rectangle([50, 450, 50 + (pA * 9), 550], fill=(0, 200, 100)) # Green bar
    d.rectangle([50 + (pA * 9), 450, 1030, 550], fill=(200, 50, 50)) # Red bar
    d.text((500, 400), "WHO IS RIGHT?", fill=(255,255,255))
    d.text((100, 600), f"{s['side_a']}: {pA}%", fill=(255,255,255))
    d.text((700, 600), f"{s['side_b']}: {pB}%", fill=(255,255,255))
    d.text((450, 1000), "HaghBaKieBot", fill=(100,100,100))

    bio = io.BytesIO()
    img.save(bio, 'PNG')
    bio.seek(0)
    return bio

# --- Handlers ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    register_user(user.id, user.username, user.full_name)
    if context.args and context.args[0].startswith("story_"):
        return await show_story(update, context, context.args[0].split("_")[1])

    kb = [["⚖️ ثبت پرونده جدید"], ["🔥 پرونده‌های داغ", "🎲 پرونده تصادفی"], ["🏆 جدول برترین‌ها", "👤 پروفایل من"]]
    await update.message.reply_text(f"سلام {user.first_name}! به دادگاه آنلاین «حق با کیه؟» خوش اومدی. ⚖️", reply_markup=ReplyKeyboardMarkup(kb, resize_keyboard=True))

async def start_submit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⚖️ داستانت رو بنویس (ناشناس منتشر میشه):")
    return SUBMIT_STORY

async def get_content(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['story_content'] = update.message.text
    await update.message.reply_text("طرف اول کیه؟ (مثلاً: من / همسرم)")
    return SUBMIT_SIDE_A

async def get_side_a(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_a'] = update.message.text
    await update.message.reply_text("طرف دوم کیه؟ (مثلاً: دوستم / راننده)")
    return SUBMIT_SIDE_B

async def get_side_b(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_b'] = update.message.text
    msg = await update.message.reply_text("🤖 در حال تحلیل توسط هوش مصنوعی...")
    title, verdict, cat = ai_analyze_story(context.user_data['story_content'])
    context.user_data['ai'] = {'title': title, 'verdict': verdict, 'cat': cat}
    
    preview = f"🔖 **تیتر هوشمند:** {title}\n📂 **دسته:** {cat}\n\n📝 {context.user_data['story_content']}\n\n1️⃣ {context.user_data['side_a']}\n2️⃣ {context.user_data['side_b']}\n\n✅ تایید می‌کنی؟"
    kb = [[InlineKeyboardButton("✅ تایید و انتشار", callback_data="confirm_story"), InlineKeyboardButton("❌ لغو", callback_data="cancel_story")]]
    await msg.edit_text(preview, reply_markup=InlineKeyboardMarkup(kb), parse_mode=ParseMode.MARKDOWN)
    return CONFIRM_STORY

async def confirm_story(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "confirm_story":
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_stories (creator_id, title, content, side_a, side_b, ai_verdict, category, expires_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                    (update.effective_user.id, context.user_data['ai']['title'], context.user_data['story_content'], context.user_data['side_a'], context.user_data['side_b'], context.user_data['ai']['verdict'], context.user_data['ai']['cat'], datetime.now() + timedelta(hours=24)))
                s_id = cur.fetchone()['id']
                cur.execute("UPDATE hbk_users SET points = points + 10 WHERE user_id = %s", (update.effective_user.id,))
            conn.commit()
        link = f"https://t.me/{(await context.bot.get_me()).username}?start=story_{s_id}"
        await query.edit_message_text(f"✅ پرونده با موفقیت ثبت شد!\n💰 +۱۰ امتیاز کسب کردی.\n\n🔗 لینک رأی‌گیری:\n{link}")
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
            votes = cur.fetchall()
            cur.execute("SELECT COUNT(*) as c FROM hbk_comments WHERE story_id = %s", (story_id,))
            comment_count = cur.fetchone()['c']
    
    cA = next((x['count'] for x in votes if x['choice'] == 'A'), 0)
    cB = next((x['count'] for x in votes if x['choice'] == 'B'), 0)
    total = cA + cB
    pA, pB = (cA/total*100, cB/total*100) if total > 0 else (50,50)
    
    txt = f"⚖️ **{s['title']}**\n📂 دسته: {s['category']}\n\n📝 {s['content']}\n\n📊 **نتایج مردم:**\n{s['side_a']}: {pA:.1f}% ({cA} رأی)\n{s['side_b']}: {pB:.1f}% ({cB} رأی)\n\n🤖 **نظر قاضی هوشمند:**\n_{s['ai_verdict']}_"
    kb = [
        [InlineKeyboardButton(f"حق با {s['side_a']}", callback_data=f"v_{story_id}_A"), InlineKeyboardButton(f"حق با {s['side_b']}", callback_data=f"v_{story_id}_B")],
        [InlineKeyboardButton(f"💬 نظرات ({comment_count})", callback_data=f"comm_{story_id}"), InlineKeyboardButton("📸 ساخت کارت استوری", callback_data=f"card_{story_id}")],
    ]
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
        await query.answer("✅ رأی شما با موفقیت ثبت شد (+۲ امتیاز)")
    except:
        await query.answer("❌ شما قبلاً رأی داده‌اید!", show_alert=True)
    await show_story(update, context, s_id)

async def send_story_card(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    story_id = query.data.split("_")[1]
    await query.answer("🎨 در حال ساخت کارت...")
    card = create_story_card(story_id)
    await query.message.reply_photo(photo=card, caption="🎁 کارت استوری شما آماده است! آن را در اینستاگرام به اشتراک بگذارید.")

async def any_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.message.text == "🔥 پرونده‌های داغ":
        return await list_hot(update, context)
    if update.message.text == "🎲 پرونده تصادفی":
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM hbk_stories ORDER BY RANDOM() LIMIT 1")
                res = cur.fetchone()
                if res: return await show_story(update, context, res['id'])
    if update.message.text == "🏆 جدول برترین‌ها":
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT full_name, points FROM hbk_users ORDER BY points DESC LIMIT 10")
                users = cur.fetchall()
        txt = "🏆 **برترین قضات دادگاه:**\n\n"
        for i, u in enumerate(users, 1): txt += f"{i}. {u['full_name']} — {u['points']} امتیاز\n"
        await update.message.reply_text(txt, parse_mode=ParseMode.MARKDOWN)

async def list_hot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, title FROM hbk_stories ORDER BY created_at DESC LIMIT 5")
            stories = cur.fetchall()
    if not stories: return await update.message.reply_text("پرونده‌ای یافت نشد.")
    kb = [[InlineKeyboardButton(s['title'], callback_data=f"view_{s['id']}")] for s in stories]
    await update.message.reply_text("🔥 جدیدترین پرونده‌ها:", reply_markup=InlineKeyboardMarkup(kb))

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
    app.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit)],
        states={SUBMIT_STORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_content)],
                SUBMIT_SIDE_A: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a)],
                SUBMIT_SIDE_B: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b)],
                CONFIRM_STORY: [CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$")]},
        fallbacks=[CommandHandler("cancel", lambda u,c: ConversationHandler.END)]
    ))
    app.add_handler(CallbackQueryHandler(handle_vote, pattern="^v_"))
    app.add_handler(CallbackQueryHandler(send_story_card, pattern="^card_"))
    app.add_handler(CallbackQueryHandler(lambda u,c: show_story(u,c,u.callback_query.data.split('_')[1]), pattern="^view_"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, any_text))
    logger.info("Ultimate HaghBaKie Bot Started...")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
