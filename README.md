# 🤖 Ani – Strategic AI Telegram CRM

Ani is a sophisticated AI assistant designed to act as a **Strategic Agent** directly from a personal Telegram account (Userbot). Built as a monorepo, it features a persistent Python backend paired with a premium Next.js administrator dashboard.

Unlike simple chatbots, Ani is designed for deep personalization, featuring a **Two-Tier Memory Architecture** and a dynamic **Targeted Goals Engine**.

---

## 🌟 Key Features

### 1. Two-Tier Memory System (Cost-Efficient Persistence)
- **Instant Context (Short-Term):** The bot instantly retrieves the last 10 messages for fluid conversational flow.
- **Lifestyle Summarizer (Long-Term):** In the background (every 5 messages), an asynchronous AI task evaluates the conversation and updates a persistent "Lifestyle Summary" in the Supabase database. This allows the AI to implicitly "remember" facts about the user from 6 months ago without exceeding token limits or requiring complex Vector databases.

### 2. Targeted Goals Engine
- The Administrator can assign a **Secret Objective** to any specific user via the dashboard (e.g., *"Make the user trust you"*, or *"Pitch the $50 Masterclass"*).
- The AI will cross-reference this goal with the user's personal Lifestyle Summary to seamlessly an naturally steer the conversation toward the objective.
- **Variable Aggression:** In the dashboard, you can define the strictness of the pitch (Subtle, Balanced, or Aggressive).

### 3. Full-Stack CRM Dashboard
- **Live Viewing:** Monitor conversation histories in real-time.
- **Manual Intervention:** Instantly pause the AI logic and send messages natively from the dashboard directly to the Telegram user.
- **Persona & Memory Overrides:** Manually edit the AI's understanding of a user, or force the AI to regenerate its summary.
- **Secure Authentication:** Password-protected interface (`DASHBOARD_PASSWORD`).

---

## 🛠️ Tech Stack Architecture

### Backend (`/backend`)
- **FastAPI:** Exposes the API bridge, allowing the Next.js frontend to command the bot.
- **Pyrogram:** Operates the Telegram connection as a persistent Userbot.
- **Supabase (PostgreSQL):** Handles robust tracking of users, message histories, and state.
- **Groq API / Llama-3.3-70B:** Industry-leading fast inference for the dialogue and background summarization pipelines.

### Frontend (`/dashboard`)
- **Next.js (App Router)**
- **Vanilla CSS:** Highly-optimized, minimalist dark-mode design system with responsive mobile-support.

---

## 🚀 Getting Started

### 1. Running the Backend
1. Navigate to the backend folder: `cd backend`
2. Install dependencies: `pip install -r requirements.txt`
3. Configure your `.env` variables (Supabase, Groq, Telegram API).
4. Run the API and Pyrogram Client concurrently: 
   ```bash
   python main.py
   ```

*Note: For cloud hosting (like Railway), run `python generate_session.py` locally first to generate a `TELEGRAM_STRING_SESSION` string to avoid filesystem login blocks!*

### 2. Running the Dashboard
1. Navigate to the dashboard folder: `cd dashboard`
2. Install dependencies: `npm install`
3. Check your `.env.local` variables (Ensure `NEXT_PUBLIC_API_URL` points to your active FastAPI port).
4. Start the frontend:
   ```bash
   npm run dev
   ```
5. Navigate to `http://localhost:3000` and sign in using your designated dashboard password.

---

## 🔐 Security Warnings
- Because this relies on Pyrogram, the backend stores a highly sensitive `.session` file (or `TELEGRAM_STRING_SESSION` environment variable) that functions as full authorization into the host's Telegram account. 
- Ensure these files and strings are **never** committed to version control.
