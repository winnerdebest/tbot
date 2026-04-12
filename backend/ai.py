"""
ai.py — AI Handler with Persona + Lifestyle Memory
Handles all Grok (xAI) API calls including response generation
and lifestyle summarization. Uses OpenAI-compatible SDK.
"""

import os
import yaml
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# Configure Groq — OpenAI-compatible endpoint (FREE tier)
# ============================================================
client = AsyncOpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)
MODEL = "llama-3.3-70b-versatile"


# ============================================================
# Persona Loading (from persona.yaml)
# ============================================================

def _load_persona() -> dict:
    """Load the persona configuration from persona.yaml."""
    persona_path = os.path.join(os.path.dirname(__file__), "persona.yaml")
    with open(persona_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _build_persona_prompt() -> str:
    """Build the base persona system prompt from persona.yaml."""
    persona = _load_persona()
    traits = ", ".join(persona["character_traits"])
    emotions = ", ".join(persona["emotion_style"])

    prompt = persona["base_instructions"]
    prompt = prompt.replace("{{name}}", persona["name"])
    prompt = prompt.replace("{{traits}}", traits)
    prompt = prompt.replace("{{emotion}}", emotions)

    return prompt


# ============================================================
# Response Generation
# ============================================================

async def generate_response(
    lifestyle_summary: str,
    recent_messages: list[dict],
    new_message: str,
    sender_name: str,
    target_goal: str | None = None,
    goal_strictness: str = "balanced",
) -> str:
    """
    Generate an AI response using:
    1. Persona (from persona.yaml)
    2. Lifestyle context (from Supabase user_profiles)
    3. Recent chat history (from Supabase message_logs)
    4. The new incoming message

    This is the core "memory injection" — the AI knows who it's
    talking to because the lifestyle_summary is baked into the prompt.
    """
    persona_prompt = _build_persona_prompt()

    # Optional: Targeted Goal Logic
    goal_prompt = ""
    if target_goal:
        goal_prompt = (
            f"\n\n--- 🎯 YOUR SECRET OBJECTIVE ---\n"
            f"You have a targeted objective to accomplish with this user:\n"
            f"OBJECTIVE: {target_goal}\n"
            f"STRICTNESS ({goal_strictness.upper()}): "
        )
        if goal_strictness == "subtle":
            goal_prompt += "Advance this goal extremely subtly across multiple messages. Do not be pushy. Wait for natural openings in the conversation."
        elif goal_strictness == "aggressive":
            goal_prompt += "Be direct and aggressive. Push strongly for this goal right now in every message. Prioritize this over normal chat."
        else:
            goal_prompt += "Balance casual conversation with this goal. Steer them toward it naturally but clearly."
        goal_prompt += "\n--- END SECRET OBJECTIVE ---"

    # Build the full system prompt with persona + lifestyle memory + goal
    system_prompt = (
        f"{persona_prompt}\n\n"
        f"--- MEMORY ABOUT THIS USER ---\n"
        f"You are chatting with {sender_name}. "
        f"Here is what you know about them from past conversations:\n"
        f"{lifestyle_summary}\n"
        f"Use this context naturally — don't dump it all at once. "
        f"Reference it only when relevant to the conversation.\n"
        f"--- END MEMORY ---"
        f"{goal_prompt}"
    )

    # Build message history for Grok (OpenAI chat format)
    messages = [
        {"role": "system", "content": system_prompt},
    ]

    # Add recent conversation history
    for msg in recent_messages:
        role = "assistant" if msg["role"] == "bot" else "user"
        messages.append({"role": role, "content": msg["content"]})

    # Add the new incoming message
    messages.append({"role": "user", "content": f"{sender_name}: {new_message}"})

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"❌ [AI ERROR]: {e}")
        return "I'm having a bit of trouble thinking straight right now. Give me a moment."


# ============================================================
# PHASE 3: Lifestyle Summarizer
# ============================================================

async def generate_lifestyle_summary(recent_messages: list[dict]) -> str:
    """
    Analyze recent messages and extract a lifestyle summary.
    Called by update_lifestyle_summary() in main.py.

    Takes the last 10 messages and asks Grok to extract:
    - Interests and hobbies
    - Daily habits and routines
    - Lifestyle facts (job, location, preferences, etc.)
    - Communication style

    Returns a concise paragraph summarizing the user.
    """
    if not recent_messages:
        return "New user. No data yet."

    # Format messages for analysis
    conversation = "\n".join(
        f"[{msg['role'].upper()}]: {msg['content']}" for msg in recent_messages
    )

    summarizer_prompt = (
        "You are an analytical assistant. Analyze the following conversation "
        "between a user and a bot. Extract key facts about the USER (not the bot).\n\n"
        "Focus on:\n"
        "- Their interests, hobbies, and passions\n"
        "- Daily habits and routines they mention\n"
        "- Lifestyle facts (job, school, location, relationships, pets, etc.)\n"
        "- Their communication style and personality traits\n"
        "- Any preferences they've expressed (food, music, activities, etc.)\n\n"
        "Write a concise paragraph (3-5 sentences) summarizing what you know "
        "about this person. Only include facts that are clearly stated or "
        "strongly implied — do not speculate.\n\n"
        "If there isn't enough information, say 'Limited data — user has not "
        "shared much about themselves yet.'\n\n"
        f"--- CONVERSATION ---\n{conversation}\n--- END ---"
    )

    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": summarizer_prompt}],
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"❌ [SUMMARIZER ERROR]: {e}")
        return "Error generating summary. Will retry on next trigger."
