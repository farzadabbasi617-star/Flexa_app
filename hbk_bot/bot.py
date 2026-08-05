import os
import logging
import asyncio
import threading
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

# States
SUBMIT_STORY, SUBMIT_SIDE_A, SUBMIT_SIDE_B, CONFIRM_STORY = range(4)

# Logging
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

# DB Helpers
def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def register_user(user_id, username, full_name):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO hbk_users (user_id, username, full_name) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET username=%s, full_name=%s",
                (user_id, username, full_name, username, full_name)
            )
        conn.commit()

# --- Handlers ---

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    register_user(user.id, user.username, user.full_name)
    
    # Check for deep linking (voting via link)
    if context.args and context.args[0].startswith("story_"):
        story_id = context.args[0].split("_")[1]
        return await show_story(update, context, story_id)

    keyboard = [["⚖️ ثبت پرونده جدید"], ["🔥 پرونده‌های داغ", "👤 پرونده‌های من"]]
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    
    await update.message.reply_text(
        f"سلام {user.first_name}! به دادگاه آنلاین «حق با کیه؟» خوش اومدی. ⚖️\n\n"
        "اینجا می‌تونی داستان‌های واقعی‌ت رو ناشناس تعریف کنی و بذاری بقیه قضاوت کنن.",
        reply_markup=reply_markup
    )

# --- Submit Story Conversation ---

async def start_submit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("خیلی خب! داستانت رو کوتاه (حداکثر ۵۰۰ حرف) بنویس. سعی کن کاملاً بی‌طرفانه باشه:")
    return SUBMIT_STORY

async def get_content(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['story_content'] = update.message.text
    await update.message.reply_text("طرف اول ماجرا کیه؟ (مثلاً: من / فروشنده / راننده)")
    return SUBMIT_SIDE_A

async def get_side_a(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_a'] = update.message.text
    await update.message.reply_text("طرف دوم ماجرا کیه؟ (مثلاً: دوستم / مشتری / همسایه)")
    return SUBMIT_SIDE_B

async def get_side_b(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['side_b'] = update.message.text
    content = context.user_data['story_content']
    a = context.user_data['side_a']
    b = context.user_data['side_b']
    
    preview = f"⚖️ **پیش‌نمایش پرونده:**\n\n📝 {content}\n\n1️⃣ {a}\n2️⃣ {b}\n\nآیا تایید می‌کنی؟"
    keyboard = [[InlineKeyboardButton("✅ تایید و انتشار", callback_data="confirm_story"), 
                 InlineKeyboardButton("❌ لغو", callback_data="cancel_story")]]
    await update.message.reply_text(preview, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    return CONFIRM_STORY

async def confirm_story(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "confirm_story":
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO hbk_stories (creator_id, content, side_a, side_b, expires_at) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (update.effective_user.id, context.user_data['story_content'], context.user_data['side_a'], context.user_data['side_b'], datetime.now() + timedelta(hours=24))
                )
                story_id = cur.fetchone()['id']
            conn.commit()
        
        bot_username = (await context.bot.get_me()).username
        link = f"https://t.me/{bot_username}?start=story_{story_id}"
        await query.edit_message_text(f"✅ پرونده شما ثبت شد و تا ۲۴ ساعت آینده فعاله!\n\n🔗 لینک دعوت برای رأی‌گیری:\n{link}")
    else:
        await query.edit_message_text("❌ عملیات لغو شد.")
    
    return ConversationHandler.END

# --- Voting Logic ---

async def show_story(update: Update, context: ContextTypes.DEFAULT_TYPE, story_id):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM hbk_stories WHERE id = %s", (story_id,))
            story = cur.fetchone()
            
            if not story:
                await update.message.reply_text("پرونده پیدا نشد.")
                return

            cur.execute("SELECT choice, COUNT(*) as count FROM hbk_votes WHERE story_id = %s GROUP BY choice", (story_id,))
            votes = cur.fetchall()
            
    # Calculate Percentages
    count_a = next((v['count'] for v in votes if v['choice'] == 'A'), 0)
    count_b = next((v['count'] for v in votes if v['choice'] == 'B'), 0)
    total = count_a + count_b
    pct_a = (count_a / total * 100) if total > 0 else 0
    pct_b = (count_b / total * 100) if total > 0 else 0

    text = f"⚖️ **قضاوت با شماست:**\n\n📝 {story['content']}\n\n📊 آمار فعلی:\n{story['side_a']}: {pct_a:.1f}% ({count_a} رأی)\n{story['side_b']}: {pct_b:.1f}% ({count_b} رأی)"
    
    keyboard = [[
        InlineKeyboardButton(f"حق با {story['side_a']}", callback_data=f"vote_{story_id}_A"),
        InlineKeyboardButton(f"حق با {story['side_b']}", callback_data=f"vote_{story_id}_B")
    ]]
    
    if update.callback_query:
        await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    else:
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

async def handle_vote(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    _, story_id, choice = query.data.split("_")
    user_id = update.effective_user.id
    
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO hbk_votes (story_id, voter_id, choice) VALUES (%s, %s, %s)", (story_id, user_id, choice))
            conn.commit()
        await query.answer("رأی شما با موفقیت ثبت شد!")
    except psycopg2.IntegrityError:
        await query.answer("شما قبلاً به این پرونده رأی داده‌اید!", show_alert=True)
    
    await show_story(update, context, story_id)

# --- Browse Stories ---

async def list_hot_stories(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, content FROM hbk_stories WHERE status='active' ORDER BY created_at DESC LIMIT 5")
            stories = cur.fetchall()
    
    if not stories:
        await update.message.reply_text("در حال حاضر پرونده فعالی وجود ندارد.")
        return
        
    text = "🔥 **پرونده‌های داغ اخیر:**\n\n"
    keyboard = []
    for s in stories:
        keyboard.append([InlineKeyboardButton(s['content'][:50] + "...", callback_data=f"view_{s['id']}")])
        
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

async def view_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    story_id = query.data.split("_")[1]
    await query.answer()
    await show_story(update, context, story_id)

# --- Health Check ---
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b"OK")
    def log_message(self, format, *args): return

def run_health_check():
    server = HTTPServer(('0.0.0.0', PORT), HealthCheckHandler)
    server.serve_forever()

# --- Main ---
# --- Main ---
def main():
    app = Application.builder().token(BOT_TOKEN).build()
    
    conv_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^⚖️ ثبت پرونده جدید$"), start_submit)],
        states={
            SUBMIT_STORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_content)],
            SUBMIT_SIDE_A: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_a)],
            SUBMIT_SIDE_B: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_side_b)],
            CONFIRM_STORY: [CallbackQueryHandler(confirm_story, pattern="^(confirm|cancel)_story$")],
        },
        fallbacks=[CommandHandler("cancel", lambda u, c: ConversationHandler.END)],
    )
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(conv_handler)
    app.add_handler(MessageHandler(filters.Regex("^🔥 پرونده‌های داغ$"), list_hot_stories))
    app.add_handler(CallbackQueryHandler(handle_vote, pattern="^vote_"))
    app.add_handler(CallbackQueryHandler(view_callback, pattern="^view_"))
    
    # Use Webhook for Render
    url_path = BOT_TOKEN.split(":")[0]
    app.run_webhook(
        listen="0.0.0.0",
        port=PORT,
        url_path=url_path,
        webhook_url=f"https://haghbakie-bot-independent.onrender.com/{url_path}"
    )

if __name__ == "__main__":
    main()
