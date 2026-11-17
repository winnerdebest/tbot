"""
repo.py — Multi-tenant repository layer.
Every data access method strictly scopes queries by `user_id` (the platform owner).
"""

import uuid
from datetime import datetime, date, timezone, timedelta
from sqlalchemy import select, func, delete, update, desc
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActivityLog,
    AgentSettings,
    AuthSession,
    Contact,
    DEFAULT_PERSONA,
    Message,
    TelegramConnection,
    UsageDaily,
    User,
    utcnow,
)
from app.core.security import (
    encrypt_secret,
    decrypt_secret,
    generate_session_token,
    hash_password,
    hash_session_token,
    mask_api_key,
    verify_password,
)
from app.core.config import settings


# ============================================================
# Users & Auth Sessions
# ============================================================

async def create_user(
    session: AsyncSession,
    email: str,
    password: str,
    name: str = "Owner",
) -> User:
    email_norm = email.strip().lower()
    user = User(
        email=email_norm,
        name=name.strip() or "Owner",
        password_hash=hash_password(password),
        role="user",
        onboarding_completed=False,
    )
    session.add(user)
    await session.flush()

    # Initialize default AgentSettings & TelegramConnection row
    ag = AgentSettings(
        user_id=user.id,
        persona=dict(DEFAULT_PERSONA),
    )
    tc = TelegramConnection(
        user_id=user.id,
        status="disconnected",
    )
    session.add_all([ag, tc])
    await session.commit()
    await session.refresh(user)
    return user


async def get_or_create_google_user(
    session: AsyncSession,
    email: str,
    name: str = "Owner",
) -> tuple[User, bool]:
    """
    Find existing user by Google email or create a new OAuth user account.
    Returns (user, is_new_user).
    """
    email_norm = email.strip().lower()
    existing = await get_user_by_email(session, email_norm)
    if existing:
        if name and existing.name == "Owner":
            existing.name = name.strip()
            await session.commit()
            await session.refresh(existing)
        return existing, False

    # OAuth users don't use password login; store an unguessable random token hash
    user = await create_user(
        session,
        email=email_norm,
        password=generate_session_token(),
        name=name.strip() or "Owner",
    )
    return user, True


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    res = await session.execute(
        select(User).where(User.email == email.strip().lower())
    )
    return res.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    res = await session.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def authenticate_user(
    session: AsyncSession, email: str, password: str
) -> User | None:
    user = await get_user_by_email(session, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


async def create_auth_session(session: AsyncSession, user_id: uuid.UUID) -> str:
    raw_token = generate_session_token()
    token_hash = hash_session_token(raw_token)
    expires = utcnow() + timedelta(days=settings.SESSION_TTL_DAYS)
    auth_sess = AuthSession(
        token_hash=token_hash,
        user_id=user_id,
        expires_at=expires,
    )
    session.add(auth_sess)
    await session.commit()
    return raw_token


async def get_user_by_session_token(
    session: AsyncSession, raw_token: str
) -> User | None:
    if not raw_token:
        return None
    token_hash = hash_session_token(raw_token)
    res = await session.execute(
        select(User)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(
            AuthSession.token_hash == token_hash,
            AuthSession.expires_at > utcnow(),
        )
    )
    return res.scalar_one_or_none()


async def delete_auth_session(session: AsyncSession, raw_token: str) -> None:
    if not raw_token:
        return
    token_hash = hash_session_token(raw_token)
    await session.execute(
        delete(AuthSession).where(AuthSession.token_hash == token_hash)
    )
    await session.commit()


# ============================================================
# Agent Settings & Persona
# ============================================================

async def get_or_create_agent_settings(
    session: AsyncSession, user_id: uuid.UUID
) -> AgentSettings:
    res = await session.execute(
        select(AgentSettings).where(AgentSettings.user_id == user_id)
    )
    ag = res.scalar_one_or_none()
    if ag is None:
        ag = AgentSettings(user_id=user_id, persona=dict(DEFAULT_PERSONA))
        session.add(ag)
        await session.commit()
        await session.refresh(ag)
    return ag


async def save_groq_api_key(
    session: AsyncSession,
    user_id: uuid.UUID,
    api_key: str,
    model: str | None = None,
) -> AgentSettings:
    ag = await get_or_create_agent_settings(session, user_id)
    clean_key = api_key.strip()
    if clean_key:
        ag.groq_key_encrypted = encrypt_secret(clean_key)
        ag.groq_key_mask = mask_api_key(clean_key)
    else:
        ag.groq_key_encrypted = None
        ag.groq_key_mask = None
    if model:
        ag.model = model
    ag.updated_at = utcnow()
    await session.commit()
    await session.refresh(ag)
    return ag


def get_decrypted_groq_key(ag: AgentSettings) -> str:
    if not ag.groq_key_encrypted:
        return ""
    try:
        return decrypt_secret(ag.groq_key_encrypted)
    except Exception:
        return ""


async def update_agent_settings(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    enabled: bool | None = None,
    model: str | None = None,
    reply_mode: str | None = None,
    audience: str | None = None,
    pause_minutes_after_manual: int | None = None,
    batch_seconds: int | None = None,
    respond_in_groups: bool | None = None,
    handoff_keywords: list[str] | None = None,
    persona: dict | None = None,
) -> AgentSettings:
    ag = await get_or_create_agent_settings(session, user_id)
    if enabled is not None:
        ag.enabled = enabled
    if model is not None:
        ag.model = model
    if reply_mode is not None:
        ag.reply_mode = reply_mode
    if audience is not None:
        ag.audience = audience
    if pause_minutes_after_manual is not None:
        ag.pause_minutes_after_manual = pause_minutes_after_manual
    if batch_seconds is not None:
        ag.batch_seconds = batch_seconds
    if respond_in_groups is not None:
        ag.respond_in_groups = respond_in_groups
    if handoff_keywords is not None:
        ag.handoff_keywords = handoff_keywords
    if persona is not None:
        merged = dict(DEFAULT_PERSONA)
        merged.update(ag.persona or {})
        merged.update(persona)
        ag.persona = merged
    ag.updated_at = utcnow()
    await session.commit()
    await session.refresh(ag)
    return ag


# ============================================================
# Telegram Connection
# ============================================================

async def get_or_create_telegram_connection(
    session: AsyncSession, user_id: uuid.UUID
) -> TelegramConnection:
    res = await session.execute(
        select(TelegramConnection).where(TelegramConnection.user_id == user_id)
    )
    tc = res.scalar_one_or_none()
    if tc is None:
        tc = TelegramConnection(user_id=user_id, status="disconnected")
        session.add(tc)
        await session.commit()
        await session.refresh(tc)
    return tc


async def save_telegram_session(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    session_string: str,
    tg_user_id: int | None,
    tg_username: str | None,
    tg_first_name: str | None,
    tg_phone: str | None = None,
    api_id_override: int | None = None,
    api_hash_override: str | None = None,
) -> TelegramConnection:
    tc = await get_or_create_telegram_connection(session, user_id)
    tc.session_encrypted = encrypt_secret(session_string)
    tc.tg_user_id = tg_user_id
    tc.tg_username = tg_username
    tc.tg_first_name = tg_first_name
    if tg_phone:
        tc.tg_phone = tg_phone
    if api_id_override:
        tc.api_id_override = api_id_override
    if api_hash_override:
        tc.api_hash_encrypted = encrypt_secret(api_hash_override)
    tc.status = "connected"
    tc.last_error = None
    tc.connected_at = utcnow()
    tc.updated_at = utcnow()
    await session.commit()
    await session.refresh(tc)
    return tc


async def mark_telegram_disconnected(
    session: AsyncSession,
    user_id: uuid.UUID,
    status: str = "disconnected",
    error: str | None = None,
    clear_session: bool = False,
) -> TelegramConnection:
    tc = await get_or_create_telegram_connection(session, user_id)
    tc.status = status
    tc.last_error = error
    if clear_session:
        tc.session_encrypted = None
        tc.tg_user_id = None
        tc.tg_username = None
        tc.tg_first_name = None
        tc.tg_phone = None
        tc.connected_at = None
    tc.updated_at = utcnow()
    await session.commit()
    await session.refresh(tc)
    return tc


async def list_connected_telegram_accounts(
    session: AsyncSession,
) -> list[TelegramConnection]:
    res = await session.execute(
        select(TelegramConnection).where(
            TelegramConnection.status == "connected",
            TelegramConnection.session_encrypted.is_not(None),
        )
    )
    return list(res.scalars().all())


# ============================================================
# Contacts (Per-Tenant CRM)
# ============================================================

async def upsert_contact(
    session: AsyncSession,
    user_id: uuid.UUID,
    telegram_id: int,
    username: str | None,
    first_name: str,
) -> Contact:
    stmt = (
        pg_insert(Contact)
        .values(
            user_id=user_id,
            telegram_id=telegram_id,
            username=username,
            first_name=first_name or "User",
            last_active=utcnow(),
        )
        .on_conflict_do_update(
            index_elements=["user_id", "telegram_id"],
            set_={
                "username": username,
                "first_name": first_name or "User",
                "last_active": utcnow(),
            },
        )
        .returning(Contact)
    )
    res = await session.execute(stmt)
    await session.commit()
    return res.scalar_one()


async def get_contact(
    session: AsyncSession, user_id: uuid.UUID, telegram_id: int
) -> Contact | None:
    res = await session.execute(
        select(Contact).where(
            Contact.user_id == user_id,
            Contact.telegram_id == telegram_id,
        )
    )
    return res.scalar_one_or_none()


async def list_contacts(
    session: AsyncSession, user_id: uuid.UUID, limit: int = 200
) -> list[Contact]:
    res = await session.execute(
        select(Contact)
        .where(Contact.user_id == user_id)
        .order_by(desc(Contact.last_active))
        .limit(limit)
    )
    return list(res.scalars().all())


async def update_contact_fields(
    session: AsyncSession,
    user_id: uuid.UUID,
    telegram_id: int,
    **fields,
) -> Contact | None:
    contact = await get_contact(session, user_id, telegram_id)
    if not contact:
        return None
    for k, v in fields.items():
        if hasattr(contact, k):
            setattr(contact, k, v)
    await session.commit()
    await session.refresh(contact)
    return contact


# ============================================================
# Messages & Drafts
# ============================================================

async def log_message(
    session: AsyncSession,
    user_id: uuid.UUID,
    telegram_id: int,
    role: str,
    content: str,
    status: str = "sent",
) -> Message:
    # Ensure contact row exists first (FK constraint)
    existing = await get_contact(session, user_id, telegram_id)
    if not existing:
        await upsert_contact(session, user_id, telegram_id, None, f"User {telegram_id}")

    msg = Message(
        user_id=user_id,
        telegram_id=telegram_id,
        role=role,
        status=status,
        content=content,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return msg


async def get_recent_messages(
    session: AsyncSession,
    user_id: uuid.UUID,
    telegram_id: int,
    limit: int = 12,
) -> list[dict]:
    res = await session.execute(
        select(Message)
        .where(
            Message.user_id == user_id,
            Message.telegram_id == telegram_id,
            Message.status == "sent",
        )
        .order_by(desc(Message.created_at))
        .limit(limit)
    )
    rows = list(res.scalars().all())[::-1]
    return [
        {
            "id": str(r.id),
            "role": r.role,
            "status": r.status,
            "content": r.content,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


async def get_contact_messages(
    session: AsyncSession,
    user_id: uuid.UUID,
    telegram_id: int,
    limit: int = 200,
) -> list[Message]:
    res = await session.execute(
        select(Message)
        .where(
            Message.user_id == user_id,
            Message.telegram_id == telegram_id,
            Message.status.in_(["sent", "draft", "queued"]),
        )
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    return list(res.scalars().all())


async def list_all_messages(
    session: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 60,
    role: str | None = None,
    status: str | None = None,
) -> list[Message]:
    stmt = select(Message).where(Message.user_id == user_id)
    if role:
        stmt = stmt.where(Message.role == role)
    if status:
        stmt = stmt.where(Message.status == status)
    stmt = stmt.order_by(desc(Message.created_at)).limit(limit)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def get_message_by_id(
    session: AsyncSession, user_id: uuid.UUID, message_id: uuid.UUID
) -> Message | None:
    res = await session.execute(
        select(Message).where(
            Message.user_id == user_id,
            Message.id == message_id,
        )
    )
    return res.scalar_one_or_none()


async def count_contact_messages(
    session: AsyncSession,
    user_id: uuid.UUID,
    telegram_id: int,
    role: str | None = None,
) -> int:
    stmt = select(func.count(Message.id)).where(
        Message.user_id == user_id,
        Message.telegram_id == telegram_id,
        Message.status == "sent",
    )
    if role:
        stmt = stmt.where(Message.role == role)
    res = await session.execute(stmt)
    return int(res.scalar_one() or 0)


async def list_queued_contacts(
    session: AsyncSession, user_id: uuid.UUID
) -> list[int]:
    """Return distinct telegram_ids for a tenant that have queued messages waiting for schedule open."""
    res = await session.execute(
        select(Message.telegram_id)
        .where(
            Message.user_id == user_id,
            Message.status == "queued",
        )
        .distinct()
    )
    return [int(r) for r in res.scalars().all()]


async def mark_queued_messages_sent(
    session: AsyncSession, user_id: uuid.UUID, telegram_id: int
) -> None:
    await session.execute(
        update(Message)
        .where(
            Message.user_id == user_id,
            Message.telegram_id == telegram_id,
            Message.status == "queued",
        )
        .values(status="sent")
    )
    await session.commit()


# ============================================================
# Activity Logs & Usage Stats
# ============================================================

async def record_activity(
    session: AsyncSession,
    user_id: uuid.UUID,
    event_type: str,
    summary: str,
    telegram_id: int | None = None,
    contact_name: str | None = None,
) -> ActivityLog:
    item = ActivityLog(
        user_id=user_id,
        event_type=event_type,
        telegram_id=telegram_id,
        contact_name=contact_name,
        summary=summary,
    )
    session.add(item)
    await session.commit()
    return item


async def increment_usage(
    session: AsyncSession,
    user_id: uuid.UUID,
    replies_delta: int = 0,
    tokens_delta: int = 0,
    summaries_delta: int = 0,
) -> None:
    today = utcnow().date()
    stmt = (
        pg_insert(UsageDaily)
        .values(
            user_id=user_id,
            day=today,
            replies_count=replies_delta,
            tokens_used=tokens_delta,
            summaries_count=summaries_delta,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "day"],
            set_={
                "replies_count": UsageDaily.replies_count + replies_delta,
                "tokens_used": UsageDaily.tokens_used + tokens_delta,
                "summaries_count": UsageDaily.summaries_count + summaries_delta,
            },
        )
    )
    await session.execute(stmt)
    await session.commit()


async def get_dashboard_stats(
    session: AsyncSession, user_id: uuid.UUID
) -> dict:
    total_contacts = int(
        (
            await session.execute(
                select(func.count(Contact.telegram_id)).where(
                    Contact.user_id == user_id
                )
            )
        ).scalar_one()
        or 0
    )
    total_messages = int(
        (
            await session.execute(
                select(func.count(Message.id)).where(
                    Message.user_id == user_id, Message.status == "sent"
                )
            )
        ).scalar_one()
        or 0
    )
    bot_replies = int(
        (
            await session.execute(
                select(func.count(Message.id)).where(
                    Message.user_id == user_id,
                    Message.role == "bot",
                    Message.status == "sent",
                )
            )
        ).scalar_one()
        or 0
    )
    pending_drafts = int(
        (
            await session.execute(
                select(func.count(Message.id)).where(
                    Message.user_id == user_id,
                    Message.status == "draft",
                )
            )
        ).scalar_one()
        or 0
    )

    since_24h = utcnow() - timedelta(hours=24)
    active_today = int(
        (
            await session.execute(
                select(func.count(Contact.telegram_id)).where(
                    Contact.user_id == user_id,
                    Contact.last_active >= since_24h,
                )
            )
        ).scalar_one()
        or 0
    )

    usage_rows = (
        await session.execute(
            select(UsageDaily)
            .where(UsageDaily.user_id == user_id)
            .order_by(desc(UsageDaily.day))
            .limit(14)
        )
    ).scalars().all()

    return {
        "total_users": total_contacts,
        "total_messages": total_messages,
        "bot_replies": bot_replies,
        "pending_drafts": pending_drafts,
        "active_today": active_today,
        "usage_daily": [
            {
                "day": u.day.isoformat(),
                "replies_count": u.replies_count,
                "tokens_used": u.tokens_used,
                "summaries_count": u.summaries_count,
            }
            for u in reversed(list(usage_rows))
        ],
    }
