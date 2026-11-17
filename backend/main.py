"""
main.py — Ani v2 Multi-Tenant Telegram AI SaaS Backend
Stack: FastAPI + SQLAlchemy 2.0 (Async Neon PostgreSQL) + Telethon Userbot Session Manager + Groq BYOK.
"""

from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, Depends, Cookie, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import init_db, get_db
from app.db import repo
from app.api.routes import api_router, _extract_token
from app.telegram.manager import session_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_required_secrets()
    print("=" * 60)
    print(f"🚀 Starting Ani v2 Backend (ENVIRONMENT={settings.ENVIRONMENT})")
    print("   🗄️  Database : Neon PostgreSQL (SQLAlchemy Async)")
    print("   📡 Telegram : Multi-Tenant Telethon Session Manager")
    print("   🤖 AI Engine: BYOK Groq API + Per-Tenant Memory & Drafts")
    print("=" * 60)

    try:
        await init_db()
        await session_manager.startup()
    except Exception as e:
        print(f"⚠️ [STARTUP WARNING]: Initial DB connection deferred ({e}). Will connect on demand.")
    yield
    print("👋 Shutting down Telethon Session Manager...")
    await session_manager.shutdown()


api = FastAPI(
    title="Ani v2 — Multi-Tenant Telegram AI Agent API",
    description="Hosted multi-tenant backend where anyone can connect their Telegram and Groq API key",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

if settings.cors_origin_list:
    api.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Cookie"],
    )


@api.get("/health")
async def health(
    session: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
    cookie_token: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
):
    raw = _extract_token(authorization, cookie_token)
    user = await repo.get_user_by_session_token(session, raw) if raw else None
    if user:
        ag = await repo.get_or_create_agent_settings(session, user.id)
        return {
            "status": "ok",
            "authenticated": True,
            "bot_enabled": ag.enabled,
            "telegram_connected": user.id in session_manager.active_clients,
        }
    return {
        "status": "ok",
        "authenticated": False,
        "bot_enabled": False,
        "active_sessions": len(session_manager.active_clients),
    }


api.include_router(api_router)


if __name__ == "__main__":
    uvicorn.run("main:api", host="0.0.0.0", port=settings.PORT, reload=False)
