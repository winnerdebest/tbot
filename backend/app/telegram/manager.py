"""
manager.py — Multi-Tenant Telethon Userbot Session Manager.
Handles:
- Interactive QR code login & Phone + OTP + 2FA login flows directly from the web UI
- Persistent active Telethon clients per tenant
- Message burst batching, auto-pause when owner messages manually, draft mode,
  handoff keywords, schedule & busy-hour message queueing, and background memory summarization.
"""

import asyncio
import base64
import io
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import qrcode
from telethon import TelegramClient, events
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PasswordHashInvalidError,
)
from telethon.sessions import StringSession

from app.core.config import settings
from app.core.security import decrypt_secret
from app.db.session import get_session_factory
from app.db import repo
from app.db.models import utcnow
from app.agent.engine import (
    generate_agent_reply,
    generate_contact_summary,
    is_persona_available,
)


BUSY_TRANSITION_MESSAGES = {
    "sleep": [
        "hey! heading to bed now, super tired — i'll catch up with you in the morning! 🌙",
        "just about to pass out lol, talk tomorrow? 😴",
        "logging off for the night! i'll text you back in the morning ✨",
    ],
    "work": [
        "hey! just stepping into work/focus hours right now, i'll reply as soon as i'm free! 💻",
        "in the middle of work right now — i'll check my messages and get back to you shortly!",
        "heads up, busy for a bit with work! will text you back when i'm done ✨",
    ],
}


def make_qr_data_url(url: str) -> str:
    """Render a tg://login?token=... URL into a base64 PNG data URL."""
    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


@dataclass
class PendingLoginFlow:
    user_id: uuid.UUID
    mode: str  # "qr" | "phone"
    api_id: int
    api_hash: str
    client: TelegramClient
    qr_login: object | None = None
    qr_url: str | None = None
    qr_image_data_url: str | None = None
    phone: str | None = None
    phone_code_hash: str | None = None
    status: str = "pending"  # pending | needs_2fa | connected | error | expired
    error: str | None = None
    watcher_task: asyncio.Task | None = None
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class BurstBuffer:
    texts: list[str] = field(default_factory=list)
    sender_name: str = "User"
    username: str | None = None
    timer_task: asyncio.Task | None = None


class MultiTenantSessionManager:
    def __init__(self) -> None:
        self.active_clients: dict[uuid.UUID, TelegramClient] = {}
        self.pending_logins: dict[uuid.UUID, PendingLoginFlow] = {}
        self.burst_buffers: dict[tuple[uuid.UUID, int], BurstBuffer] = {}
        self._scheduler_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def resolve_api_credentials(
        self, api_id_override: int | None = None, api_hash_override: str | None = None
    ) -> tuple[int, str]:
        api_id = api_id_override or settings.API_ID
        api_hash = (api_hash_override or settings.API_HASH or "").strip()
        if not api_id or not api_hash:
            raise ValueError(
                "Telegram API_ID and API_HASH are required. Provide them in the connection form or set API_ID/API_HASH in backend/.env (get them free at https://my.telegram.org)."
            )
        return int(api_id), api_hash

    async def startup(self) -> None:
        """Reconnect all saved tenant Telegram sessions on server startup and start background queue worker."""
        factory = get_session_factory()
        async with factory() as session:
            conns = await repo.list_connected_telegram_accounts(session)

        print(f"📡 [SESSION MANAGER]: Restoring {len(conns)} connected Telegram account(s)...")
        for tc in conns:
            try:
                await self.start_tenant_client(tc.user_id)
            except Exception as e:
                print(f"⚠️ [SESSION MANAGER]: Failed to restore session for {tc.user_id}: {e}")

        self._scheduler_task = asyncio.create_task(self._queued_messages_loop())

    async def shutdown(self) -> None:
        if self._scheduler_task:
            self._scheduler_task.cancel()
        for flow in list(self.pending_logins.values()):
            await self._cleanup_pending(flow.user_id)
        for uid, client in list(self.active_clients.items()):
            try:
                await client.disconnect()
            except Exception:
                pass
        self.active_clients.clear()

    async def _cleanup_pending(self, user_id: uuid.UUID) -> None:
        flow = self.pending_logins.pop(user_id, None)
        if not flow:
            return
        if flow.watcher_task and not flow.watcher_task.done():
            flow.watcher_task.cancel()
        try:
            await flow.client.disconnect()
        except Exception:
            pass

    # ============================================================
    # 1. Interactive Web Login Flows (QR & Phone)
    # ============================================================

    async def start_qr_login(
        self,
        user_id: uuid.UUID,
        api_id_override: int | None = None,
        api_hash_override: str | None = None,
    ) -> dict:
        await self._cleanup_pending(user_id)
        api_id, api_hash = self.resolve_api_credentials(api_id_override, api_hash_override)

        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()
        qr_login = await client.qr_login()
        qr_img = make_qr_data_url(qr_login.url)

        flow = PendingLoginFlow(
            user_id=user_id,
            mode="qr",
            api_id=api_id,
            api_hash=api_hash,
            client=client,
            qr_login=qr_login,
            qr_url=qr_login.url,
            qr_image_data_url=qr_img,
            status="pending",
        )
        self.pending_logins[user_id] = flow
        flow.watcher_task = asyncio.create_task(self._watch_qr_login(flow))

        return {
            "status": "pending",
            "qr_url": flow.qr_url,
            "qr_image": flow.qr_image_data_url,
        }

    async def _watch_qr_login(self, flow: PendingLoginFlow) -> None:
        try:
            while flow.status == "pending":
                try:
                    await flow.qr_login.wait(timeout=28)
                    # Scanned and authorized!
                    await self._finalize_login(flow)
                    return
                except SessionPasswordNeededError:
                    flow.status = "needs_2fa"
                    return
                except asyncio.TimeoutError:
                    # Refresh QR token
                    await flow.qr_login.recreate()
                    flow.qr_url = flow.qr_login.url
                    flow.qr_image_data_url = make_qr_data_url(flow.qr_login.url)
        except asyncio.CancelledError:
            return
        except Exception as e:
            flow.status = "error"
            flow.error = str(e)

    async def start_phone_login(
        self,
        user_id: uuid.UUID,
        phone: str,
        api_id_override: int | None = None,
        api_hash_override: str | None = None,
    ) -> dict:
        await self._cleanup_pending(user_id)
        api_id, api_hash = self.resolve_api_credentials(api_id_override, api_hash_override)

        clean_phone = phone.strip()
        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()
        sent = await client.send_code_request(clean_phone)

        flow = PendingLoginFlow(
            user_id=user_id,
            mode="phone",
            api_id=api_id,
            api_hash=api_hash,
            client=client,
            phone=clean_phone,
            phone_code_hash=sent.phone_code_hash,
            status="code_sent",
        )
        self.pending_logins[user_id] = flow
        return {"status": "code_sent", "phone": clean_phone}

    async def verify_phone_code(self, user_id: uuid.UUID, code: str) -> dict:
        flow = self.pending_logins.get(user_id)
        if not flow or flow.mode != "phone":
            raise ValueError("No active phone login session found. Please request a code again.")

        try:
            await flow.client.sign_in(
                phone=flow.phone,
                code=code.strip(),
                phone_code_hash=flow.phone_code_hash,
            )
            return await self._finalize_login(flow)
        except SessionPasswordNeededError:
            flow.status = "needs_2fa"
            return {"status": "needs_2fa"}
        except (PhoneCodeInvalidError, PhoneCodeExpiredError) as e:
            raise ValueError(f"Invalid or expired verification code: {e}")

    async def verify_2fa_password(self, user_id: uuid.UUID, password: str) -> dict:
        flow = self.pending_logins.get(user_id)
        if not flow:
            raise ValueError("No active login session waiting for 2FA password.")
        try:
            await flow.client.sign_in(password=password)
            return await self._finalize_login(flow)
        except PasswordHashInvalidError:
            raise ValueError("Incorrect 2FA cloud password.")

    async def connect_session_string(
        self,
        user_id: uuid.UUID,
        session_string: str,
        api_id_override: int | None = None,
        api_hash_override: str | None = None,
    ) -> dict:
        """Allow direct import of an existing Telethon StringSession."""
        api_id, api_hash = self.resolve_api_credentials(api_id_override, api_hash_override)
        client = TelegramClient(StringSession(session_string.strip()), api_id, api_hash)
        await client.connect()
        if not await client.is_user_authorized():
            await client.disconnect()
            raise ValueError("Provided session string is not authorized or has expired.")

        me = await client.get_me()
        exported = client.session.save()
        await client.disconnect()

        factory = get_session_factory()
        async with factory() as session:
            tc = await repo.save_telegram_session(
                session,
                user_id,
                session_string=exported,
                tg_user_id=me.id,
                tg_username=getattr(me, "username", None),
                tg_first_name=getattr(me, "first_name", None),
                tg_phone=getattr(me, "phone", None),
                api_id_override=api_id_override,
                api_hash_override=api_hash_override,
            )
            await repo.record_activity(
                session,
                user_id,
                "telegram_connected",
                f"Connected Telegram account @{tc.tg_username or tc.tg_first_name or tc.tg_user_id}",
            )

        await self.start_tenant_client(user_id)
        return {
            "status": "connected",
            "tg_user_id": me.id,
            "tg_username": getattr(me, "username", None),
            "tg_first_name": getattr(me, "first_name", None),
        }

    async def _finalize_login(self, flow: PendingLoginFlow) -> dict:
        me = await flow.client.get_me()
        session_str = flow.client.session.save()
        flow.status = "connected"

        factory = get_session_factory()
        async with factory() as session:
            tc = await repo.save_telegram_session(
                session,
                flow.user_id,
                session_string=session_str,
                tg_user_id=me.id,
                tg_username=getattr(me, "username", None),
                tg_first_name=getattr(me, "first_name", None),
                tg_phone=getattr(me, "phone", None) or flow.phone,
                api_id_override=flow.api_id if flow.api_id != settings.API_ID else None,
                api_hash_override=flow.api_hash if flow.api_hash != settings.API_HASH else None,
            )
            await repo.record_activity(
                session,
                flow.user_id,
                "telegram_connected",
                f"Connected Telegram account @{tc.tg_username or tc.tg_first_name or tc.tg_user_id}",
            )

        # Disconnect temporary login client and spin up persistent handler client
        await self._cleanup_pending(flow.user_id)
        await self.start_tenant_client(flow.user_id)

        return {
            "status": "connected",
            "tg_user_id": me.id,
            "tg_username": getattr(me, "username", None),
            "tg_first_name": getattr(me, "first_name", None),
        }

    def get_pending_status(self, user_id: uuid.UUID) -> dict:
        flow = self.pending_logins.get(user_id)
        if not flow:
            if user_id in self.active_clients:
                return {"status": "connected"}
            return {"status": "idle"}
        return {
            "status": flow.status,
            "mode": flow.mode,
            "qr_url": flow.qr_url,
            "qr_image": flow.qr_image_data_url,
            "error": flow.error,
        }

    # ============================================================
    # 2. Persistent Tenant Client Lifecycle & Handlers
    # ============================================================

    async def start_tenant_client(self, user_id: uuid.UUID) -> bool:
        async with self._lock:
            old = self.active_clients.pop(user_id, None)
            if old:
                try:
                    await old.disconnect()
                except Exception:
                    pass

            factory = get_session_factory()
            async with factory() as session:
                tc = await repo.get_or_create_telegram_connection(session, user_id)
                if not tc.session_encrypted:
                    return False

                session_str = decrypt_secret(tc.session_encrypted)
                api_hash_ovr = (
                    decrypt_secret(tc.api_hash_encrypted) if tc.api_hash_encrypted else None
                )
                api_id, api_hash = self.resolve_api_credentials(
                    tc.api_id_override, api_hash_ovr
                )

            client = TelegramClient(StringSession(session_str), api_id, api_hash)
            await client.connect()
            if not await client.is_user_authorized():
                await client.disconnect()
                async with factory() as session:
                    await repo.mark_telegram_disconnected(
                        session,
                        user_id,
                        status="expired",
                        error="Telegram session expired or was revoked from devices.",
                    )
                return False

            self._register_handlers(user_id, client)
            self.active_clients[user_id] = client
            print(f"✅ [SESSION MANAGER]: Active Telethon userbot running for tenant {user_id}")
            return True

    async def disconnect_tenant(self, user_id: uuid.UUID, log_out_remote: bool = True) -> None:
        await self._cleanup_pending(user_id)
        client = self.active_clients.pop(user_id, None)
        if client:
            try:
                if log_out_remote:
                    await client.log_out()
                else:
                    await client.disconnect()
            except Exception:
                pass

        factory = get_session_factory()
        async with factory() as session:
            await repo.mark_telegram_disconnected(
                session, user_id, status="disconnected", clear_session=True
            )

    def _register_handlers(self, user_id: uuid.UUID, client: TelegramClient) -> None:
        @client.on(events.NewMessage(outgoing=True))
        async def on_outgoing(event):
            """
            Handle owner's own outgoing messages:
            1. Support `.bot on` / `.bot off` self-commands
            2. Auto-pause AI in a private chat when the owner manually messages from their phone!
            """
            text = (event.raw_text or "").strip()
            if text.lower() in (".bot on", ".bot off"):
                enable = text.lower().endswith("on")
                factory = get_session_factory()
                async with factory() as session:
                    await repo.update_agent_settings(session, user_id, enabled=enable)
                await event.edit(f"{'✅ AI Agent **Enabled**.' if enable else '⏸️ AI Agent **Paused**.'}")
                return

            if not event.is_private:
                return

            # If this message was sent manually from the owner's Telegram app (not by our bot pipeline),
            # pause AI for this contact according to pause_minutes_after_manual.
            chat_id = event.chat_id
            if not chat_id:
                return

            factory = get_session_factory()
            async with factory() as session:
                ag = await repo.get_or_create_agent_settings(session, user_id)
                if ag.pause_minutes_after_manual > 0:
                    paused_until = utcnow() + timedelta(minutes=ag.pause_minutes_after_manual)
                    contact = await repo.get_contact(session, user_id, chat_id)
                    if contact:
                        await repo.update_contact_fields(
                            session, user_id, chat_id, paused_until=paused_until
                        )

        @client.on(events.NewMessage(incoming=True))
        async def on_incoming(event):
            if not event.is_private and not event.is_group:
                return

            text = (event.raw_text or "").strip()
            if not text:
                return

            sender = await event.get_sender()
            if not sender or getattr(sender, "bot", False):
                return

            chat_id = event.chat_id
            sender_name = getattr(sender, "first_name", None) or "User"
            username = getattr(sender, "username", None)

            factory = get_session_factory()
            async with factory() as session:
                ag = await repo.get_or_create_agent_settings(session, user_id)
                if not ag.enabled:
                    return
                if event.is_group and not ag.respond_in_groups:
                    return

                contact = await repo.upsert_contact(
                    session, user_id, chat_id, username, sender_name
                )
                if contact.is_blocked or contact.ai_mode == "off":
                    return

                if (
                    ag.audience == "allowlist"
                    and not contact.is_allowlisted
                    and contact.ai_mode != "on"
                ):
                    return

                # Check handoff keywords
                lower_text = text.lower()
                for kw in ag.handoff_keywords or []:
                    if kw and kw.lower() in lower_text:
                        pause_until = utcnow() + timedelta(hours=2)
                        await repo.log_message(
                            session, user_id, chat_id, role="user", content=text, status="sent"
                        )
                        await repo.update_contact_fields(
                            session, user_id, chat_id, paused_until=pause_until
                        )
                        await repo.record_activity(
                            session,
                            user_id,
                            "handoff_triggered",
                            f"Paused AI for {sender_name} due to handoff keyword '{kw}'",
                            telegram_id=chat_id,
                            contact_name=sender_name,
                        )
                        return

                # Check if auto-paused
                if contact.paused_until and contact.paused_until > utcnow():
                    await repo.log_message(
                        session, user_id, chat_id, role="user", content=text, status="sent"
                    )
                    return

                # Check schedule availability
                available, sched_status = is_persona_available(ag.persona or {})
                if not available:
                    # Queue message for when schedule opens
                    await repo.log_message(
                        session, user_id, chat_id, role="user", content=text, status="queued"
                    )
                    if contact.last_notified_status != sched_status:
                        busy_msg = random.choice(
                            BUSY_TRANSITION_MESSAGES.get(
                                sched_status, BUSY_TRANSITION_MESSAGES["work"]
                            )
                        )
                        await repo.update_contact_fields(
                            session, user_id, chat_id, last_notified_status=sched_status
                        )
                        await client.send_read_acknowledge(chat_id)
                        async with client.action(chat_id, "typing"):
                            await asyncio.sleep(1.8)
                        await client.send_message(chat_id, busy_msg)
                        await repo.log_message(
                            session,
                            user_id,
                            chat_id,
                            role="bot",
                            content=busy_msg,
                            status="sent",
                        )
                    return

                if contact.last_notified_status is not None:
                    await repo.update_contact_fields(
                        session, user_id, chat_id, last_notified_status=None
                    )

                # Log incoming user message immediately
                await repo.log_message(
                    session, user_id, chat_id, role="user", content=text, status="sent"
                )
                batch_sec = max(0, min(int(ag.batch_seconds or 0), 30))

            # Batch burst messages over `batch_sec` seconds so 3 rapid messages get 1 coherent reply
            key = (user_id, chat_id)
            buf = self.burst_buffers.get(key)
            if not buf:
                buf = BurstBuffer(sender_name=sender_name, username=username)
                self.burst_buffers[key] = buf
            buf.texts.append(text)
            buf.sender_name = sender_name
            buf.username = username

            if buf.timer_task and not buf.timer_task.done():
                buf.timer_task.cancel()

            buf.timer_task = asyncio.create_task(
                self._flush_burst_after_delay(user_id, chat_id, max(batch_sec, 1))
            )

    async def _flush_burst_after_delay(
        self, user_id: uuid.UUID, chat_id: int, delay_seconds: int
    ) -> None:
        try:
            await asyncio.sleep(delay_seconds)
        except asyncio.CancelledError:
            return

        buf = self.burst_buffers.pop((user_id, chat_id), None)
        if not buf or not buf.texts:
            return

        combined_text = "\n".join(buf.texts)
        await self._generate_and_deliver_reply(
            user_id=user_id,
            chat_id=chat_id,
            incoming_text=combined_text,
            sender_name=buf.sender_name,
        )

    async def _generate_and_deliver_reply(
        self,
        *,
        user_id: uuid.UUID,
        chat_id: int,
        incoming_text: str,
        sender_name: str,
    ) -> None:
        client = self.active_clients.get(user_id)
        factory = get_session_factory()

        async with factory() as session:
            ag = await repo.get_or_create_agent_settings(session, user_id)
            contact = await repo.get_contact(session, user_id, chat_id)
            if not ag.enabled or not contact or contact.is_blocked:
                return

            groq_key = repo.get_decrypted_groq_key(ag)
            recent = await repo.get_recent_messages(session, user_id, chat_id, limit=12)

            reply_text, tokens = await generate_agent_reply(
                api_key=groq_key,
                model=ag.model,
                persona=ag.persona or {},
                lifestyle_summary=contact.lifestyle_summary,
                recent_messages=recent,
                new_message=incoming_text,
                sender_name=sender_name,
                context_notes=contact.context_notes,
                goal_mode=contact.goal_mode,
            )

            if not reply_text:
                return

            # Decide whether this reply is a Draft or Auto-Sent
            effective_mode = (
                "draft"
                if contact.ai_mode == "draft" or ag.reply_mode == "draft"
                else "auto"
            )

            if effective_mode == "draft" or not client:
                await repo.log_message(
                    session,
                    user_id,
                    chat_id,
                    role="bot",
                    content=reply_text,
                    status="draft",
                )
                await repo.increment_usage(session, user_id, tokens_delta=tokens)
                await repo.record_activity(
                    session,
                    user_id,
                    "draft_created",
                    f"Created draft reply for {sender_name}",
                    telegram_id=chat_id,
                    contact_name=sender_name,
                )
                return

        # Auto-send over Telegram with realistic human typing simulation
        try:
            await client.send_read_acknowledge(chat_id)
            typing_delay = min(len(reply_text) / random.uniform(4.0, 7.0), 12.0)
            async with client.action(chat_id, "typing"):
                await asyncio.sleep(typing_delay)
            await client.send_message(chat_id, reply_text)
        except Exception as e:
            print(f"❌ [TELEGRAM SEND ERROR]: {e}")
            return

        async with factory() as session:
            await repo.log_message(
                session, user_id, chat_id, role="bot", content=reply_text, status="sent"
            )
            await repo.increment_usage(
                session, user_id, replies_delta=1, tokens_delta=tokens
            )
            await repo.record_activity(
                session,
                user_id,
                "reply_sent",
                f"Replied to {sender_name}: \"{reply_text[:70]}\"",
                telegram_id=chat_id,
                contact_name=sender_name,
            )
            user_msg_count = await repo.count_contact_messages(
                session, user_id, chat_id, role="user"
            )
            if user_msg_count > 0 and user_msg_count % 5 == 0:
                asyncio.create_task(self.refresh_contact_summary(user_id, chat_id))

    async def refresh_contact_summary(
        self, user_id: uuid.UUID, telegram_id: int
    ) -> str | None:
        factory = get_session_factory()
        async with factory() as session:
            ag = await repo.get_or_create_agent_settings(session, user_id)
            contact = await repo.get_contact(session, user_id, telegram_id)
            if not contact:
                return None
            recent = await repo.get_recent_messages(
                session, user_id, telegram_id, limit=20
            )
            groq_key = repo.get_decrypted_groq_key(ag)
            new_summary, tokens = await generate_contact_summary(
                api_key=groq_key,
                model=ag.model,
                recent_messages=recent,
                current_summary=contact.lifestyle_summary,
            )
            if new_summary:
                await repo.update_contact_fields(
                    session, user_id, telegram_id, lifestyle_summary=new_summary
                )
                await repo.increment_usage(
                    session, user_id, tokens_delta=tokens, summaries_delta=1
                )
                await repo.record_activity(
                    session,
                    user_id,
                    "summary_updated",
                    f"Updated memory summary for {contact.first_name}",
                    telegram_id=telegram_id,
                    contact_name=contact.first_name,
                )
                return new_summary
        return None

    async def send_manual_or_approved_message(
        self,
        *,
        user_id: uuid.UUID,
        telegram_id: int,
        text: str,
        role: str = "owner",
        pause_ai: bool = True,
    ) -> tuple[bool, str]:
        """
        Send a message from the dashboard (either manual owner message or approved draft).
        Even if Telegram is not currently connected (e.g., during dashboard testing), logs the message
        and returns whether it was delivered over Telegram.
        """
        client = self.active_clients.get(user_id)
        delivered_tg = False
        tg_error = None

        if client:
            try:
                await client.send_message(telegram_id, text)
                delivered_tg = True
            except Exception as e:
                tg_error = str(e)

        factory = get_session_factory()
        async with factory() as session:
            ag = await repo.get_or_create_agent_settings(session, user_id)
            await repo.log_message(
                session,
                user_id,
                telegram_id,
                role=role,
                content=text,
                status="sent",
            )
            if pause_ai and role == "owner" and ag.pause_minutes_after_manual > 0:
                paused_until = utcnow() + timedelta(
                    minutes=ag.pause_minutes_after_manual
                )
                await repo.update_contact_fields(
                    session, user_id, telegram_id, paused_until=paused_until
                )

        if delivered_tg:
            return True, "sent"
        if tg_error:
            return False, f"Logged in CRM, but Telegram send failed: {tg_error}"
        return True, "logged_offline"

    async def _queued_messages_loop(self) -> None:
        """Every 60 seconds, check if any tenant with queued busy-hour messages is now available."""
        while True:
            try:
                await asyncio.sleep(60)
                factory = get_session_factory()
                for user_id in list(self.active_clients.keys()):
                    async with factory() as session:
                        ag = await repo.get_or_create_agent_settings(session, user_id)
                        if not ag.enabled:
                            continue
                        available, _ = is_persona_available(ag.persona or {})
                        if not available:
                            continue
                        queued_tg_ids = await repo.list_queued_contacts(
                            session, user_id
                        )

                    for tg_id in queued_tg_ids:
                        async with factory() as session:
                            contact = await repo.get_contact(session, user_id, tg_id)
                            await repo.mark_queued_messages_sent(
                                session, user_id, tg_id
                            )
                            recent = await repo.get_recent_messages(
                                session, user_id, tg_id, limit=5
                            )
                        last_user_msg = next(
                            (m["content"] for m in reversed(recent) if m["role"] == "user"),
                            None,
                        )
                        if contact and last_user_msg:
                            await self._generate_and_deliver_reply(
                                user_id=user_id,
                                chat_id=tg_id,
                                incoming_text=last_user_msg,
                                sender_name=contact.first_name,
                            )
            except asyncio.CancelledError:
                return
            except Exception as e:
                print(f"⚠️ [QUEUE LOOP ERROR]: {e}")


session_manager = MultiTenantSessionManager()
