# 🤖 Ani v2 — Hosted Multi-Tenant Telegram AI Agent Platform

Ani v2 is a hosted, multi-tenant AI Telegram platform where anyone can create an account, connect their **normal Telegram account** (no Telegram Premium required), paste their **Groq API key (BYOK)**, and customize their personal AI clone, schedule, and automation rules.

---

## ✨ What's New in Ani v2

1. **Multi-Tenant Accounts & FastAPI-Owned Auth (No Supabase Needed)**
   - Built on **FastAPI + SQLAlchemy 2.0 (Async) + Neon PostgreSQL**.
   - Argon2 password hashing, database-backed session tokens, and strict `user_id` tenant isolation across all contacts, messages, settings, and logs.
2. **Connect Any Free Telegram Account (No Premium Required)**
   - Powered by **Telethon** (`MultiTenantSessionManager`).
   - Connect directly from the web dashboard via **QR Code Scan**, **Phone + OTP + 2FA**, or **Session String**.
3. **Bring Your Own Groq API Key (Encrypted at Rest)**
   - Each user pastes their own Groq API key (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `meta-llama/llama-4-scout-17b-16e-instruct`, `qwen/qwen3-32b`).
   - Keys and Telegram sessions are encrypted with **AES-256-GCM** at rest and validated live.
4. **Smart Conversation & Safety Features**
   - **Auto-Pause on Manual Reply**: When you text a contact yourself from your phone or the dashboard, the AI automatically pauses in that chat for N minutes.
   - **Draft Approval Mode**: Choose between full Auto-Reply or Draft Mode (approve, edit, or discard AI drafts in 1 click).
   - **Message Burst Batching**: Combines rapid-fire incoming messages over a configurable window into a single natural response.
   - **Life Schedule & Busy-Hour Queue**: Sends a natural transition message when you're asleep/working and queues incoming chats until your schedule opens.
   - **Handoff Keywords & Anti-Injection Guard**: Automatically pauses the AI when urgent keywords are detected.
   - **Live Persona Sandbox**: Test your AI persona and tone directly in the browser before going live.

---

## 🚀 Quick Start

### 1. Start the Backend (`/backend`)
```bash
cd backend
pip install -r requirements.txt
python main.py
```
The FastAPI server and Multi-Tenant Telethon Session Manager will launch on `http://localhost:8000` and automatically initialize all tables in your Neon PostgreSQL database.

### 2. Start the Frontend (`/dashboard`)
```bash
cd dashboard
npm install
npm run dev
```
Open `http://localhost:3000`, create an account, and step through the **4-Step Onboarding Wizard**.
