"""
main.py — Persistent AI Telegram Assistant
Architecture: FastAPI (HTTP/Dashboard) + Pyrogram (Telegram) + Supabase (DB)
Both servers run concurrently via asyncio.

Flow:
1. Message arrives via Pyrogram
2. Upsert user into Supabase user_profiles
3. Fetch lifestyle_summary for personalized AI context
4. Log user message to message_logs
5. Generate AI response (Gemini + persona + lifestyle memory)
6. Reply to user + log bot response
7. Every 5th message → background task updates lifestyle_summary
"""

import asyncio
import os
import random
import threading
import uvicorn
import yaml
from contextlib import asynccontextmanager

# Fix for Python 3.14 compatibility with Pyrogram imports
try:
    asyncio.get_running_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

from dotenv import load_dotenv
from pyrogram import Client, filters, enums, idle
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import (
    upsert_user,
    get_lifestyle_summary,
    log_message,
    get_recent_messages,
    get_message_count,
    update_lifestyle,
    get_stats,
    get_user_profile,
    get_all_user_messages,
    is_user_blocked,
    set_user_blocked,
    get_blocked_users,
    update_user_goal,
)
from ai import generate_response, generate_lifestyle_summary

load_dotenv()

# ============================================================
# Configuration
# ============================================================
API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")
STRING_SESSION = os.getenv("TELEGRAM_STRING_SESSION")
BOT_ENABLED = True

# Pyrogram client: Uses string session if in production, otherwise falls back to local file.
if STRING_SESSION:
    tg = Client("tbot_session", session_string=STRING_SESSION, api_id=API_ID, api_hash=API_HASH, in_memory=True)
else:
    tg = Client("tbot_session", api_id=API_ID, api_hash=API_HASH)


# ============================================================
# PHASE 3: Lifestyle Summarizer (Background Task)
# ============================================================

async def update_lifestyle_summary(telegram_id: int):
    """
    Background task that updates a user's lifestyle summary.
    
    How it works:
    1. Fetches the last 10 messages for this user from Supabase
    2. Sends them to Gemini with a summarization prompt
    3. Updates user_profiles.lifestyle_summary with the result
    
    When it triggers:
    - Called as an asyncio background task every 5th message
      (checked via message count in the main handler)
    - This keeps the summary fresh without running on every single message
    """
    try:
        print(f"🧠 [SUMMARIZER]: Updating lifestyle summary for {telegram_id}...")
        messages = get_recent_messages(telegram_id, limit=10)
        new_summary = await generate_lifestyle_summary(messages)
        update_lifestyle(telegram_id, new_summary)
        print(f"✅ [SUMMARIZER]: Summary updated for {telegram_id}")
    except Exception as e:
        print(f"❌ [SUMMARIZER ERROR]: {e}")


# ============================================================
# Pyrogram Handlers (Telegram Message Processing)
# ============================================================

@tg.on_message(filters.me & filters.command("bot", prefixes="."))
async def toggle_bot(_, message):
    """Toggle the bot on/off or reset history. Usage: .bot on|off|reset"""
    global BOT_ENABLED
    command = message.text.split()[-1].lower()
    if command == "on":
        BOT_ENABLED = True
        await message.edit("✅ AI Bot **Enabled**.")
    elif command == "off":
        BOT_ENABLED = False
        await message.edit("❌ AI Bot **Disabled**.")
    elif command == "reset":
        # Note: clearing Supabase history could be added here if needed
        await message.edit("🧹 Bot toggled. Use Supabase dashboard to manage history.")


@tg.on_message(filters.private & ~filters.me)
async def handle_private_message(client, message):
    """
    Main message handler — the core pipeline:
    1. Upsert user → 2. Get lifestyle → 3. Log message →
    4. Generate AI response → 5. Reply + log → 6. Maybe summarize
    """
    if not BOT_ENABLED:
        return

    chat_id = message.chat.id

    # ── Check if user is blocked ──
    if is_user_blocked(chat_id):
        print(f"🚫 [BLOCKED]: Ignoring message from {chat_id}")
        return

    user_text = message.text

    if not user_text:
        return  # Skip non-text messages (stickers, media, etc.)

    sender_name = message.from_user.first_name or "User"
    username = message.from_user.username

    # ── Step 1: Upsert user into Supabase ──
    print(f"\n📩 [MESSAGE FROM {sender_name}]: {user_text}")
    upsert_user(telegram_id=chat_id, username=username, first_name=sender_name)

    # ── Step 2: Fetch full profile for context & goals ──
    profile = get_user_profile(chat_id)
    lifestyle = profile.get("lifestyle_summary", "New user. No data yet.") if profile else "New user. No data yet."
    target_goal = profile.get("target_goal") if profile else None
    goal_strictness = profile.get("goal_strictness") if profile else "balanced"
    
    print(f"📋 [CONTEXT]: {lifestyle[:80]}...")
    if target_goal:
        print(f"🎯 [GOAL]: {target_goal} (Strictness: {goal_strictness})")

    # ── Step 3: Log incoming user message ──
    log_message(telegram_id=chat_id, role="user", content=user_text)

    # Mark chat as read
    await client.read_chat_history(chat_id)

    # ── Step 4: Show "typing" for realism ──
    await client.send_chat_action(chat_id, enums.ChatAction.TYPING)
    await asyncio.sleep(random.uniform(2, 5))

    # ── Step 5: Get recent history + generate AI response ──
    recent = get_recent_messages(chat_id, limit=10)
    print(f"🤖 [AI]: Generating response with {len(recent)} messages of context...")
    response = await generate_response(
        lifestyle_summary=lifestyle,
        recent_messages=recent,
        new_message=user_text,
        sender_name=sender_name,
        target_goal=target_goal,
        goal_strictness=goal_strictness,
    )

    # ── Step 6: Reply + log bot response ──
    if response:
        print(f"📡 [RESPONSE]: {response}")
        log_message(telegram_id=chat_id, role="bot", content=response)
        await message.reply(response)

    # ── Step 7: Trigger summarizer every 5th message ──
    msg_count = get_message_count(chat_id)
    if msg_count > 0 and msg_count % 5 == 0:
        # Fire-and-forget background task — doesn't block the reply
        asyncio.create_task(update_lifestyle_summary(chat_id))


# ============================================================
# FastAPI Application (Dashboard API + Health)
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan — logs startup/shutdown."""
    print("🌐 [FASTAPI]: Dashboard API is live")
    yield
    print("🌐 [FASTAPI]: Shutting down")


api = FastAPI(
    title="Ani Bot Dashboard API",
    description="Backend API for monitoring the Telegram AI assistant",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow CORS for the Next.js dashboard frontend
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten this in production to your dashboard URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ──
@api.get("/health")
def health():
    return {"status": "ok", "bot_enabled": BOT_ENABLED}


# ── PHASE 4: Dashboard Routes ──

@api.get("/api/stats")
def stats():
    """
    GET /api/stats
    Returns total number of users and total messages.
    Used by the Next.js dashboard overview page.
    """
    data = get_stats()
    return data


class ManualMessageRequest(BaseModel):
    telegram_id: int
    text: str


@api.post("/api/manual-message")
async def manual_message(req: ManualMessageRequest):
    """
    POST /api/manual-message
    Send a message to a Telegram user from the dashboard.
    Body: { "telegram_id": 123456, "text": "Hello from dashboard!" }
    
    - Sends the message via Pyrogram
    - Logs it as a 'bot' message in message_logs
    """
    try:
        # Send message via Pyrogram client
        await tg.send_message(chat_id=req.telegram_id, text=req.text)
        # Log in Supabase
        log_message(telegram_id=req.telegram_id, role="bot", content=req.text)
        return {"status": "sent", "telegram_id": req.telegram_id, "text": req.text}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


class StatusRequest(BaseModel):
    bot_enabled: bool

@api.post("/api/status")
def update_status(req: StatusRequest):
    """Update bot enabled status"""
    global BOT_ENABLED
    BOT_ENABLED = req.bot_enabled
    return {"status": "ok", "bot_enabled": BOT_ENABLED}

@api.get("/api/persona")
def get_persona():
    """Get current persona config"""
    persona_path = os.path.join(os.path.dirname(__file__), "persona.yaml")
    with open(persona_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

@api.post("/api/persona")
def update_persona(req: dict):
    """Update persona config"""
    persona_path = os.path.join(os.path.dirname(__file__), "persona.yaml")
    with open(persona_path, "w", encoding="utf-8") as f:
        yaml.dump(req, f, allow_unicode=True, sort_keys=False)
    return {"status": "ok"}


# ── PHASE 5: User Detail & CRM Routes ──

@api.get("/api/users/{telegram_id}")
def get_user_detail(telegram_id: int):
    """Get detailed profile for a specific user."""
    profile = get_user_profile(telegram_id)
    if not profile:
        return {"error": "User not found"}
    msg_count = get_message_count(telegram_id)
    profile["message_count"] = msg_count
    profile["is_blocked"] = is_user_blocked(telegram_id)
    return profile


@api.get("/api/users/{telegram_id}/messages")
def get_user_messages(telegram_id: int):
    """Get all messages for a specific user."""
    messages = get_all_user_messages(telegram_id, limit=200)
    return {"messages": messages}


class SummaryUpdateRequest(BaseModel):
    summary: str

@api.post("/api/users/{telegram_id}/summary")
def update_user_summary(telegram_id: int, req: SummaryUpdateRequest):
    """Manually update a user's lifestyle summary."""
    update_lifestyle(telegram_id, req.summary)
    return {"status": "ok"}


class BlockRequest(BaseModel):
    blocked: bool

@api.post("/api/users/{telegram_id}/block")
def block_user(telegram_id: int, req: BlockRequest):
    """Block or unblock a user."""
    set_user_blocked(telegram_id, req.blocked)
    return {"status": "ok", "telegram_id": telegram_id, "blocked": req.blocked}


class GoalRequest(BaseModel):
    goal: str | None
    strictness: str

@api.post("/api/users/{telegram_id}/goal")
def set_target_goal(telegram_id: int, req: GoalRequest):
    """Set a targeted objective and strictness for a specific user."""
    update_user_goal(telegram_id, req.goal, req.strictness)
    return {"status": "ok", "telegram_id": telegram_id, "goal": req.goal}


@api.post("/api/users/{telegram_id}/regenerate-summary")
async def regenerate_user_summary(telegram_id: int):
    """Force-regenerate the lifestyle summary for a user."""
    try:
        messages = get_recent_messages(telegram_id, limit=10)
        new_summary = await generate_lifestyle_summary(messages)
        update_lifestyle(telegram_id, new_summary)
        return {"status": "ok", "summary": new_summary}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

# ============================================================
# Startup — Run Pyrogram + FastAPI concurrently
# ============================================================

def run_fastapi():
    """Run FastAPI/Uvicorn in a separate thread."""
    uvicorn.run(api, host="0.0.0.0", port=8000, log_level="info")


async def main():
    """
    Main entry point:
    1. Start FastAPI in a background thread
    2. Start Pyrogram and idle (handles Telegram messages)
    """
    print("=" * 50)
    print("🚀 Starting Ani — Persistent AI Assistant")
    print("   📡 Telegram: Pyrogram userbot")
    print("   🌐 Dashboard: http://localhost:8000")
    print("   🗄️  Database: Supabase PostgreSQL")
    print("   🤖 AI: Google Gemini")
    print("=" * 50)

    # Start FastAPI in a background thread so it doesn't block Pyrogram
    fastapi_thread = threading.Thread(target=run_fastapi, daemon=True)
    fastapi_thread.start()

    # Start Pyrogram
    async with tg:
        print("✅ Bot is running! Use '.bot off' to disable.")
        await idle()


if __name__ == "__main__":
    try:
        tg.run(main())
    except KeyboardInterrupt:
        print("\n👋 Bot stopped.")
