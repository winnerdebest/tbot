"""
routes.py — Complete FastAPI routes for Ani v2 Multi-Tenant SaaS Platform.
"""

import secrets
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode
import httpx
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    Header,
    HTTPException,
    Query,
    Response,
)
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.db import repo
from app.db.models import ActivityLog, User, utcnow
from app.agent.engine import (
    AVAILABLE_GROQ_MODELS,
    PERSONA_PRESETS,
    generate_agent_reply,
    resolve_groq_key,
    validate_groq_key,
)
from app.telegram.manager import session_manager

api_router = APIRouter(prefix="/api")


# ============================================================
# Authentication Dependency
# ============================================================

def _extract_token(
    authorization: str | None = Header(default=None),
    cookie_token: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    if cookie_token:
        return cookie_token.strip()
    return ""


async def get_current_user(
    session: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
    cookie_token: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> User:
    raw = _extract_token(authorization, cookie_token)
    user = await repo.get_user_by_session_token(session, raw)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="none" if settings.is_production else "lax",
        max_age=60 * 60 * 24 * settings.SESSION_TTL_DAYS,
        path="/",
    )


async def _serialize_user_state(session: AsyncSession, user: User) -> dict:
    ag = await repo.get_or_create_agent_settings(session, user.id)
    tc = await repo.get_or_create_telegram_connection(session, user.id)
    has_groq_key = bool(ag.groq_key_encrypted or resolve_groq_key(None))
    is_live_connected = user.id in session_manager.active_clients

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "onboarding_completed": user.onboarding_completed,
            "created_at": user.created_at.isoformat(),
        },
        "agent": {
            "enabled": ag.enabled,
            "model": ag.model,
            "has_groq_key": has_groq_key,
            "groq_key_mask": ag.groq_key_mask,
            "reply_mode": ag.reply_mode,
            "audience": ag.audience,
            "pause_minutes_after_manual": ag.pause_minutes_after_manual,
            "batch_seconds": ag.batch_seconds,
            "respond_in_groups": ag.respond_in_groups,
            "handoff_keywords": ag.handoff_keywords or [],
            "persona": ag.persona or {},
        },
        "telegram": {
            "status": "connected" if is_live_connected else tc.status,
            "is_live": is_live_connected,
            "tg_user_id": tc.tg_user_id,
            "tg_username": tc.tg_username,
            "tg_first_name": tc.tg_first_name,
            "tg_phone": tc.tg_phone,
            "has_custom_api_id": bool(tc.api_id_override),
            "platform_has_default_api_id": bool(settings.API_ID and settings.API_HASH),
            "last_error": tc.last_error,
            "connected_at": tc.connected_at.isoformat() if tc.connected_at else None,
        },
    }


# ============================================================
# 1. Auth Endpoints (/api/auth/*)
# ============================================================

class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(default="Owner", max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleExchangeRequest(BaseModel):
    code: str
    redirect_uri: str | None = None


class GoogleIdTokenRequest(BaseModel):
    credential: str


@api_router.get("/auth/google/config")
async def google_oauth_config():
    """Return public Google OAuth Client ID and redirect URI from environment settings."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID is not configured in backend/.env",
        )
    return {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
    }


@api_router.get("/auth/google/url")
async def google_oauth_url(redirect_uri: str | None = None):
    """Build the Google OAuth 2.0 authorization URL using environment credentials."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID is not configured in backend/.env",
        )
    target_redirect = redirect_uri or settings.GOOGLE_REDIRECT_URI
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": target_redirect,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
        "state": state,
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"url": url, "state": state, "redirect_uri": target_redirect}


@api_router.post("/auth/google/exchange")
async def google_oauth_exchange(
    req: GoogleExchangeRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
):
    """Exchange Google OAuth authorization code for user profile and create an Ani session."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in backend/.env",
        )

    target_redirect = req.redirect_uri or settings.GOOGLE_REDIRECT_URI

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": req.code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": target_redirect,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            detail = token_res.json().get("error_description") or token_res.text
            raise HTTPException(
                status_code=400,
                detail=f"Google token exchange failed: {detail}",
            )

        token_data = token_res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=400, detail="No access_token returned by Google"
            )

        userinfo_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_res.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Failed to fetch user profile from Google",
            )
        profile = userinfo_res.json()

    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=400, detail="Google account did not provide an email address"
        )

    name = profile.get("name") or email.split("@")[0]
    user, is_new = await repo.get_or_create_google_user(
        session, email=email, name=name
    )
    token = await repo.create_auth_session(session, user.id)
    _set_session_cookie(response, token)
    state = await _serialize_user_state(session, user)
    return {"status": "ok", "token": token, "is_new_user": is_new, **state}


@api_router.post("/auth/google/id-token")
async def google_oauth_id_token(
    req: GoogleIdTokenRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
):
    """Verify a Google Identity Services (GIS) ID token and create an Ani session."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID is missing in backend/.env",
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        verify_res = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": req.credential},
        )
        if verify_res.status_code != 200:
            raise HTTPException(
                status_code=401, detail="Invalid Google ID token"
            )
        payload = verify_res.json()

    if payload.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=401, detail="Google token audience mismatch"
        )

    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=400, detail="Google token missing email"
        )

    name = payload.get("name") or email.split("@")[0]
    user, is_new = await repo.get_or_create_google_user(
        session, email=email, name=name
    )
    token = await repo.create_auth_session(session, user.id)
    _set_session_cookie(response, token)
    state = await _serialize_user_state(session, user)
    return {"status": "ok", "token": token, "is_new_user": is_new, **state}


@api_router.post("/auth/register")
async def register(
    req: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
):
    existing = await repo.get_user_by_email(session, req.email)
    if existing:
        raise HTTPException(
            status_code=400, detail="An account with this email already exists."
        )
    user = await repo.create_user(
        session, email=req.email, password=req.password, name=req.name
    )
    token = await repo.create_auth_session(session, user.id)
    _set_session_cookie(response, token)
    state = await _serialize_user_state(session, user)
    return {"status": "ok", "token": token, **state}


@api_router.post("/auth/login")
async def login(
    req: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
):
    user = await repo.authenticate_user(session, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = await repo.create_auth_session(session, user.id)
    _set_session_cookie(response, token)
    state = await _serialize_user_state(session, user)
    return {"status": "ok", "token": token, **state}


@api_router.post("/auth/logout")
async def logout(
    response: Response,
    session: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
    cookie_token: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    raw = _extract_token(authorization, cookie_token)
    if raw:
        await repo.delete_auth_session(session, raw)
    response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")
    return {"status": "ok"}


@api_router.get("/auth/me")
async def me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    return await _serialize_user_state(session, user)


class OnboardingCompleteRequest(BaseModel):
    completed: bool = True


@api_router.post("/auth/onboarding-complete")
async def complete_onboarding(
    req: OnboardingCompleteRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    user.onboarding_completed = req.completed
    await session.commit()
    return {"status": "ok", "onboarding_completed": user.onboarding_completed}


# ============================================================
# 2. Groq BYOK Key & Agent Configuration Endpoints
# ============================================================

class GroqKeyRequest(BaseModel):
    api_key: str
    model: str | None = None
    validate_live: bool = True


@api_router.post("/settings/groq-key")
async def update_groq_key(
    req: GroqKeyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    clean = req.api_key.strip()
    if clean and req.validate_live:
        ok, msg = await validate_groq_key(clean)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
    ag = await repo.save_groq_api_key(
        session, user.id, api_key=clean, model=req.model
    )
    return {
        "status": "ok",
        "has_groq_key": bool(ag.groq_key_encrypted),
        "groq_key_mask": ag.groq_key_mask,
        "model": ag.model,
    }


@api_router.post("/settings/groq-key/test")
async def test_groq_key(
    req: GroqKeyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    clean = req.api_key.strip()
    if not clean:
        ag = await repo.get_or_create_agent_settings(session, user.id)
        clean = repo.get_decrypted_groq_key(ag) or resolve_groq_key(None)
    ok, msg = await validate_groq_key(clean)
    return {"valid": ok, "detail": msg}


@api_router.get("/settings/models")
async def get_available_models():
    return {
        "models": AVAILABLE_GROQ_MODELS,
        "presets": PERSONA_PRESETS,
    }


class StatusRequest(BaseModel):
    bot_enabled: bool


@api_router.post("/status")
async def update_status(
    req: StatusRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ag = await repo.update_agent_settings(session, user.id, enabled=req.bot_enabled)
    return {"status": "ok", "bot_enabled": ag.enabled}


@api_router.get("/persona")
async def get_persona(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ag = await repo.get_or_create_agent_settings(session, user.id)
    return ag.persona or {}


@api_router.post("/persona")
async def update_persona(
    req: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ag = await repo.update_agent_settings(session, user.id, persona=req)
    return {"status": "ok", "persona": ag.persona}


class RulesUpdateRequest(BaseModel):
    model: str | None = None
    reply_mode: str | None = None  # auto | draft
    audience: str | None = None    # everyone | allowlist
    pause_minutes_after_manual: int | None = None
    batch_seconds: int | None = None
    respond_in_groups: bool | None = None
    handoff_keywords: list[str] | None = None


@api_router.get("/rules")
async def get_rules(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ag = await repo.get_or_create_agent_settings(session, user.id)
    return {
        "enabled": ag.enabled,
        "model": ag.model,
        "reply_mode": ag.reply_mode,
        "audience": ag.audience,
        "pause_minutes_after_manual": ag.pause_minutes_after_manual,
        "batch_seconds": ag.batch_seconds,
        "respond_in_groups": ag.respond_in_groups,
        "handoff_keywords": ag.handoff_keywords or [],
        "has_groq_key": bool(ag.groq_key_encrypted or resolve_groq_key(None)),
        "groq_key_mask": ag.groq_key_mask,
    }


@api_router.post("/rules")
async def update_rules(
    req: RulesUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ag = await repo.update_agent_settings(
        session,
        user.id,
        model=req.model,
        reply_mode=req.reply_mode,
        audience=req.audience,
        pause_minutes_after_manual=req.pause_minutes_after_manual,
        batch_seconds=req.batch_seconds,
        respond_in_groups=req.respond_in_groups,
        handoff_keywords=req.handoff_keywords,
    )
    return {
        "status": "ok",
        "model": ag.model,
        "reply_mode": ag.reply_mode,
        "audience": ag.audience,
        "pause_minutes_after_manual": ag.pause_minutes_after_manual,
        "batch_seconds": ag.batch_seconds,
        "respond_in_groups": ag.respond_in_groups,
        "handoff_keywords": ag.handoff_keywords or [],
    }


class PreviewChatRequest(BaseModel):
    message: str
    sender_name: str = "Alex"
    history: list[dict] = Field(default_factory=list)
    persona_override: dict | None = None


@api_router.post("/agent/preview")
async def preview_agent_reply(
    req: PreviewChatRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Live Persona Sandbox: test how the AI agent responds without needing Telegram connected."""
    ag = await repo.get_or_create_agent_settings(session, user.id)
    groq_key = repo.get_decrypted_groq_key(ag)
    persona = req.persona_override or ag.persona or {}

    reply, tokens = await generate_agent_reply(
        api_key=groq_key,
        model=ag.model,
        persona=persona,
        lifestyle_summary="Close friend testing the assistant in the live sandbox.",
        recent_messages=req.history[-10:],
        new_message=req.message,
        sender_name=req.sender_name,
    )
    if not reply:
        raise HTTPException(
            status_code=400,
            detail="Could not generate a response. Please connect a valid Groq API key first.",
        )
    return {"reply": reply, "tokens": tokens}


# ============================================================
# 3. Telegram Connection Endpoints (No Premium Required!)
# ============================================================

class TelegramQrStartRequest(BaseModel):
    api_id: int | None = None
    api_hash: str | None = None


class TelegramPhoneStartRequest(BaseModel):
    phone: str
    api_id: int | None = None
    api_hash: str | None = None


class TelegramCodeVerifyRequest(BaseModel):
    code: str


class Telegram2FARequest(BaseModel):
    password: str


class TelegramSessionStringRequest(BaseModel):
    session_string: str
    api_id: int | None = None
    api_hash: str | None = None


@api_router.get("/telegram/status")
async def get_telegram_status(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    tc = await repo.get_or_create_telegram_connection(session, user.id)
    pending = session_manager.get_pending_status(user.id)
    is_live = user.id in session_manager.active_clients

    return {
        "status": "connected" if is_live else tc.status,
        "is_live": is_live,
        "tg_user_id": tc.tg_user_id,
        "tg_username": tc.tg_username,
        "tg_first_name": tc.tg_first_name,
        "tg_phone": tc.tg_phone,
        "connected_at": tc.connected_at.isoformat() if tc.connected_at else None,
        "last_error": tc.last_error,
        "pending_flow": pending,
        "platform_has_default_api_id": bool(settings.API_ID and settings.API_HASH),
    }


@api_router.post("/telegram/qr/start")
async def telegram_qr_start(
    req: TelegramQrStartRequest,
    user: User = Depends(get_current_user),
):
    try:
        return await session_manager.start_qr_login(
            user.id, api_id_override=req.api_id, api_hash_override=req.api_hash
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/telegram/phone/start")
async def telegram_phone_start(
    req: TelegramPhoneStartRequest,
    user: User = Depends(get_current_user),
):
    try:
        return await session_manager.start_phone_login(
            user.id,
            phone=req.phone,
            api_id_override=req.api_id,
            api_hash_override=req.api_hash,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/telegram/phone/verify-code")
async def telegram_phone_verify_code(
    req: TelegramCodeVerifyRequest,
    user: User = Depends(get_current_user),
):
    try:
        return await session_manager.verify_phone_code(user.id, req.code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/telegram/verify-2fa")
async def telegram_verify_2fa(
    req: Telegram2FARequest,
    user: User = Depends(get_current_user),
):
    try:
        return await session_manager.verify_2fa_password(user.id, req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/telegram/session-string")
async def telegram_import_session_string(
    req: TelegramSessionStringRequest,
    user: User = Depends(get_current_user),
):
    try:
        return await session_manager.connect_session_string(
            user.id,
            session_string=req.session_string,
            api_id_override=req.api_id,
            api_hash_override=req.api_hash,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/telegram/disconnect")
async def telegram_disconnect(
    user: User = Depends(get_current_user),
):
    await session_manager.disconnect_tenant(user.id, log_out_remote=True)
    return {"status": "disconnected"}


# ============================================================
# 4. Contacts, Inbox, Drafts & CRM Endpoints
# ============================================================

def _serialize_contact(c) -> dict:
    return {
        "telegram_id": c.telegram_id,
        "username": c.username,
        "first_name": c.first_name,
        "lifestyle_summary": c.lifestyle_summary,
        "target_goal": c.context_notes,
        "context_notes": c.context_notes,
        "goal_strictness": c.goal_mode,
        "goal_mode": c.goal_mode,
        "ai_mode": c.ai_mode,
        "is_blocked": c.is_blocked,
        "is_allowlisted": c.is_allowlisted,
        "paused_until": c.paused_until.isoformat() if c.paused_until else None,
        "last_active": c.last_active.isoformat(),
    }


def _serialize_message(m) -> dict:
    return {
        "id": str(m.id),
        "telegram_id": m.telegram_id,
        "role": m.role,
        "status": m.status,
        "content": m.content,
        "created_at": m.created_at.isoformat(),
    }


@api_router.get("/stats")
async def get_stats(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    return await repo.get_dashboard_stats(session, user.id)


@api_router.get("/users")
async def list_users_endpoint(
    limit: int = Query(default=200, ge=1, le=500),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    contacts = await repo.list_contacts(session, user.id, limit=limit)
    return {"users": [_serialize_contact(c) for c in contacts]}


class CreateContactRequest(BaseModel):
    telegram_id: int
    first_name: str = "Contact"
    username: str | None = None


@api_router.post("/users")
async def create_contact_endpoint(
    req: CreateContactRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    c = await repo.upsert_contact(
        session,
        user.id,
        telegram_id=req.telegram_id,
        username=req.username,
        first_name=req.first_name,
    )
    return _serialize_contact(c)


@api_router.get("/users/{telegram_id}")
async def get_user_detail(
    telegram_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    c = await repo.get_contact(session, user.id, telegram_id)
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    msg_count = await repo.count_contact_messages(session, user.id, telegram_id)
    data = _serialize_contact(c)
    data["message_count"] = msg_count
    return data


@api_router.get("/users/{telegram_id}/messages")
async def get_user_messages(
    telegram_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    msgs = await repo.get_contact_messages(session, user.id, telegram_id, limit=250)
    return {"messages": [_serialize_message(m) for m in msgs]}


@api_router.get("/messages")
async def list_all_messages_endpoint(
    limit: int = Query(default=60, ge=1, le=300),
    role: str | None = None,
    status: str | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    msgs = await repo.list_all_messages(
        session, user.id, limit=limit, role=role, status=status
    )
    return {"messages": [_serialize_message(m) for m in msgs]}


class SummaryUpdateRequest(BaseModel):
    summary: str


@api_router.post("/users/{telegram_id}/summary")
async def update_user_summary(
    telegram_id: int,
    req: SummaryUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    c = await repo.update_contact_fields(
        session, user.id, telegram_id, lifestyle_summary=req.summary
    )
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "ok"}


class BlockRequest(BaseModel):
    blocked: bool


@api_router.post("/users/{telegram_id}/block")
async def block_user(
    telegram_id: int,
    req: BlockRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    c = await repo.update_contact_fields(
        session, user.id, telegram_id, is_blocked=req.blocked
    )
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "ok", "telegram_id": telegram_id, "blocked": req.blocked}


class GoalRequest(BaseModel):
    goal: str | None = None
    strictness: str = "balanced"


@api_router.post("/users/{telegram_id}/goal")
async def set_target_goal(
    telegram_id: int,
    req: GoalRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    c = await repo.update_contact_fields(
        session,
        user.id,
        telegram_id,
        context_notes=req.goal,
        goal_mode=req.strictness,
    )
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "ok", "telegram_id": telegram_id, "goal": req.goal}


class ContactControlRequest(BaseModel):
    ai_mode: str | None = None  # default | on | off | draft
    is_allowlisted: bool | None = None
    pause_minutes: int | None = None  # 0 to unpause, >0 to pause


@api_router.post("/users/{telegram_id}/controls")
async def update_contact_controls(
    telegram_id: int,
    req: ContactControlRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    updates = {}
    if req.ai_mode is not None:
        updates["ai_mode"] = req.ai_mode
    if req.is_allowlisted is not None:
        updates["is_allowlisted"] = req.is_allowlisted
    if req.pause_minutes is not None:
        updates["paused_until"] = (
            utcnow() + timedelta(minutes=req.pause_minutes)
            if req.pause_minutes > 0
            else None
        )
    c = await repo.update_contact_fields(session, user.id, telegram_id, **updates)
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "ok", "contact": _serialize_contact(c)}


@api_router.post("/users/{telegram_id}/regenerate-summary")
async def regenerate_user_summary(
    telegram_id: int,
    user: User = Depends(get_current_user),
):
    summary = await session_manager.refresh_contact_summary(user.id, telegram_id)
    if not summary:
        raise HTTPException(
            status_code=400,
            detail="Failed to generate summary. Make sure your Groq API key is configured and the contact has messages.",
        )
    return {"status": "ok", "summary": summary}


class ManualMessageRequest(BaseModel):
    telegram_id: int
    text: str = Field(min_length=1, max_length=4096)


@api_router.post("/manual-message")
async def manual_message(
    req: ManualMessageRequest,
    user: User = Depends(get_current_user),
):
    ok, detail = await session_manager.send_manual_or_approved_message(
        user_id=user.id,
        telegram_id=req.telegram_id,
        text=req.text.strip(),
        role="owner",
        pause_ai=True,
    )
    return {
        "status": "sent" if ok else "error",
        "delivery": detail,
        "telegram_id": req.telegram_id,
        "text": req.text.strip(),
        "detail": None if ok else detail,
    }


class DraftActionRequest(BaseModel):
    content: str | None = None  # optional edited content when approving


@api_router.post("/drafts/{message_id}/approve")
async def approve_draft(
    message_id: uuid.UUID,
    req: DraftActionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    msg = await repo.get_message_by_id(session, user.id, message_id)
    if not msg or msg.status != "draft":
        raise HTTPException(status_code=404, detail="Draft not found")

    final_text = (req.content or msg.content).strip()
    msg.status = "discarded"
    await session.commit()

    ok, detail = await session_manager.send_manual_or_approved_message(
        user_id=user.id,
        telegram_id=msg.telegram_id,
        text=final_text,
        role="bot",
        pause_ai=False,
    )
    return {"status": "sent" if ok else "error", "detail": detail, "content": final_text}


@api_router.post("/drafts/{message_id}/discard")
async def discard_draft(
    message_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    msg = await repo.get_message_by_id(session, user.id, message_id)
    if not msg or msg.status != "draft":
        raise HTTPException(status_code=404, detail="Draft not found")
    msg.status = "discarded"
    await session.commit()
    return {"status": "ok"}


class SimulateIncomingRequest(BaseModel):
    telegram_id: int = 777000
    first_name: str = "Jordan (Demo Contact)"
    username: str = "jordan_demo"
    text: str


@api_router.post("/users/simulate-incoming")
async def simulate_incoming_message(
    req: SimulateIncomingRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """
    Simulate an incoming message from a contact to test the full CRM, Memory & Draft/Auto pipeline
    right inside the dashboard even before linking a live Telegram account.
    """
    contact = await repo.upsert_contact(
        session,
        user.id,
        telegram_id=req.telegram_id,
        username=req.username,
        first_name=req.first_name,
    )
    await repo.log_message(
        session,
        user.id,
        telegram_id=req.telegram_id,
        role="user",
        content=req.text.strip(),
        status="sent",
    )
    await session_manager._generate_and_deliver_reply(
        user_id=user.id,
        chat_id=req.telegram_id,
        incoming_text=req.text.strip(),
        sender_name=contact.first_name,
    )
    msgs = await repo.get_contact_messages(session, user.id, req.telegram_id, limit=50)
    return {
        "status": "ok",
        "contact": _serialize_contact(contact),
        "messages": [_serialize_message(m) for m in msgs],
    }


@api_router.get("/activity")
async def get_activity_feed(
    limit: int = Query(default=40, ge=1, le=200),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    res = await session.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(desc(ActivityLog.created_at))
        .limit(limit)
    )
    items = res.scalars().all()
    return {
        "activities": [
            {
                "id": str(a.id),
                "event_type": a.event_type,
                "telegram_id": a.telegram_id,
                "contact_name": a.contact_name,
                "summary": a.summary,
                "created_at": a.created_at.isoformat(),
            }
            for a in items
        ]
    }
