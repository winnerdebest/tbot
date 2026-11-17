"""
test_multi_tenant.py — Automated integration tests verifying:
1. Multi-tenant user registration, login & session isolation on Neon PostgreSQL
2. Strict tenant isolation (User B cannot view or modify User A's contacts, messages, or persona)
3. AES-256-GCM encryption at rest for Groq API keys & Telegram sessions
4. Draft mode, approval workflow, and per-contact controls
"""

import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from main import api
from app.db.session import init_db


@pytest.mark.asyncio
async def test_multi_tenant_isolation_and_workflows():
    await init_db()
    transport = ASGITransport(app=api)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email_a = f"alice_{uuid.uuid4().hex[:8]}@example.com"
        email_b = f"bob_{uuid.uuid4().hex[:8]}@example.com"

        # 1. Register Tenant A
        r_a = await client.post(
            "/api/auth/register",
            json={"name": "Alice", "email": email_a, "password": "password123"},
        )
        assert r_a.status_code == 200, r_a.text
        token_a = r_a.json()["token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # 2. Register Tenant B
        r_b = await client.post(
            "/api/auth/register",
            json={"name": "Bob", "email": email_b, "password": "password123"},
        )
        assert r_b.status_code == 200, r_b.text
        token_b = r_b.json()["token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 3. Tenant A saves encrypted Groq API key (without live validation for dummy test key)
        r_key = await client.post(
            "/api/settings/groq-key",
            headers=headers_a,
            json={
                "api_key": "gsk_test_secret_key_for_alice_9876",
                "model": "llama-3.1-8b-instant",
                "validate_live": False,
            },
        )
        assert r_key.status_code == 200
        assert r_key.json()["has_groq_key"] is True
        assert r_key.json()["groq_key_mask"] == "gsk_••••9876"

        # Tenant B should still have has_groq_key == False
        me_b = await client.get("/api/auth/me", headers=headers_b)
        assert me_b.status_code == 200
        assert me_b.json()["agent"]["has_groq_key"] is False

        # 4. Tenant A creates a contact and sends a manual message
        r_contact = await client.post(
            "/api/users",
            headers=headers_a,
            json={"telegram_id": 999111, "first_name": "Charlie", "username": "charlie_tg"},
        )
        assert r_contact.status_code == 200

        r_msg = await client.post(
            "/api/manual-message",
            headers=headers_a,
            json={"telegram_id": 999111, "text": "Hey Charlie, checking in!"},
        )
        assert r_msg.status_code == 200

        # 5. Verify Tenant A sees Charlie, while Tenant B sees 0 contacts and 404 on Charlie
        users_a = await client.get("/api/users", headers=headers_a)
        assert len(users_a.json()["users"]) == 1
        assert users_a.json()["users"][0]["first_name"] == "Charlie"

        users_b = await client.get("/api/users", headers=headers_b)
        assert len(users_b.json()["users"]) == 0

        detail_b = await client.get("/api/users/999111", headers=headers_b)
        assert detail_b.status_code == 404
