"""
db.py — Supabase Database Client
All database operations for user profiles and message logging.
Uses the supabase-py client with the service_role key.
"""

import os
import threading
from datetime import datetime, timezone
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# In-memory blocked users set (persists while bot is running)
_blocked_users: set[int] = set()

# ============================================================
# Thread-Local Supabase Client
# ============================================================

_thread_local = threading.local()


def get_supabase() -> Client:
    """Returns a thread-safe Supabase client instance."""
    if not hasattr(_thread_local, "client"):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise ValueError(
                "Missing SUPABASE_URL or SUPABASE_KEY in environment variables. "
                "Add them to your .env file."
            )
        _thread_local.client = create_client(url, key)
    return _thread_local.client


# ============================================================
# User Profile Operations
# ============================================================

def upsert_user(telegram_id: int, username: str | None, first_name: str) -> dict:
    """
    Create or update a user profile.
    Called on every incoming message to keep user data fresh.
    """
    sb = get_supabase()
    data = {
        "telegram_id": telegram_id,
        "username": username,
        "first_name": first_name,
        "last_active": datetime.now(timezone.utc).isoformat(),
    }
    result = sb.table("user_profiles").upsert(data).execute()
    return result.data[0] if result.data else data


def get_lifestyle_summary(telegram_id: int) -> str:
    """Fetch the lifestyle summary for a user. Returns default if not found."""
    sb = get_supabase()
    result = (
        sb.table("user_profiles")
        .select("lifestyle_summary")
        .eq("telegram_id", telegram_id)
        .single()
        .execute()
    )
    if result.data:
        return result.data.get("lifestyle_summary", "New user. No data yet.")
    return "New user. No data yet."


def get_user_profile(telegram_id: int) -> dict | None:
    """Fetch all details for a specific user profile."""
    sb = get_supabase()
    result = (
        sb.table("user_profiles")
        .select("*")
        .eq("telegram_id", telegram_id)
        .single()
        .execute()
    )
    return result.data if result.data else None


def is_user_blocked(telegram_id: int) -> bool:
    """Check if a user is blocked."""
    return telegram_id in _blocked_users


def set_user_blocked(telegram_id: int, blocked: bool) -> None:
    """Block or unblock a user."""
    if blocked:
        _blocked_users.add(telegram_id)
    else:
        _blocked_users.discard(telegram_id)


def get_blocked_users() -> list[int]:
    """Return list of all blocked user IDs."""
    return list(_blocked_users)


def update_lifestyle(telegram_id: int, summary: str) -> None:
    """Update the lifestyle_summary column for a user."""
    sb = get_supabase()
    sb.table("user_profiles").update(
        {"lifestyle_summary": summary}
    ).eq("telegram_id", telegram_id).execute()


def update_user_goal(telegram_id: int, goal: str | None, strictness: str = "balanced") -> None:
    """Update the target goal and strictness for a user."""
    sb = get_supabase()
    sb.table("user_profiles").update(
        {
            "target_goal": goal,
            "goal_strictness": strictness
        }
    ).eq("telegram_id", telegram_id).execute()
def update_notified_status(telegram_id: int, status: str | None) -> None:
    """Update the last_notified_status column for a user."""
    sb = get_supabase()
    sb.table("user_profiles").update(
        {"last_notified_status": status}
    ).eq("telegram_id", telegram_id).execute()



# ============================================================
# Message Log Operations
# ============================================================

def log_message(telegram_id: int, role: str, content: str) -> dict:
    """
    Insert a message into message_logs.
    role must be 'user' or 'bot'.
    """
    sb = get_supabase()
    data = {
        "telegram_id": telegram_id,
        "role": role,
        "content": content,
    }
    result = sb.table("message_logs").insert(data).execute()
    return result.data[0] if result.data else data


def get_recent_messages(telegram_id: int, limit: int = 10) -> list[dict]:
    """
    Fetch the most recent messages for a user, ordered chronologically.
    Returns list of dicts with 'role' and 'content' keys.
    """
    sb = get_supabase()
    result = (
        sb.table("message_logs")
        .select("role, content, created_at")
        .eq("telegram_id", telegram_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    # Reverse to get chronological order (oldest first)
    messages = result.data[::-1] if result.data else []
    return messages


def get_all_user_messages(telegram_id: int, limit: int = 100) -> list[dict]:
    """Fetch all messages for a user (for the dashboard CRM view)."""
    sb = get_supabase()
    result = (
        sb.table("message_logs")
        .select("id, role, content, created_at")
        .eq("telegram_id", telegram_id)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


def get_message_count(telegram_id: int) -> int:
    """Get total message count for a specific user (used to trigger summarizer)."""
    sb = get_supabase()
    result = (
        sb.table("message_logs")
        .select("id", count="exact")
        .eq("telegram_id", telegram_id)
        .execute()
    )
    return result.count or 0


# ============================================================
# Dashboard / Stats Operations
# ============================================================

def get_stats() -> dict:
    """Get total users and total messages for the dashboard."""
    sb = get_supabase()

    users_result = (
        sb.table("user_profiles")
        .select("telegram_id", count="exact")
        .execute()
    )
    messages_result = (
        sb.table("message_logs")
        .select("id", count="exact")
        .execute()
    )

    return {
        "total_users": users_result.count or 0,
        "total_messages": messages_result.count or 0,
    }
