/**
 * api.ts — Centralized API client for the FastAPI backend
 * All fetch calls to the bot backend go through here.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Stats {
  total_users: number;
  total_messages: number;
}

export interface UserProfile {
  telegram_id: number;
  username: string | null;
  first_name: string;
  lifestyle_summary: string;
  last_active: string;
  target_goal?: string | null;
  goal_strictness?: string;
}

export interface MessageLog {
  id: string;
  telegram_id: number;
  role: "user" | "bot";
  content: string;
  created_at: string;
}

export interface ManualMessageRequest {
  telegram_id: number;
  text: string;
}

export interface ManualMessageResponse {
  status: string;
  telegram_id?: number;
  text?: string;
  detail?: string;
}

/**
 * GET /api/stats — total users and messages
 */
export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_URL}/api/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

/**
 * GET /health — bot health check
 */
export async function fetchHealth(): Promise<{ status: string; bot_enabled: boolean }> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch health");
  return res.json();
}

/**
 * POST /api/manual-message — send a message via the bot
 */
export async function sendManualMessage(
  data: ManualMessageRequest
): Promise<ManualMessageResponse> {
  const res = await fetch(`${API_URL}/api/manual-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

/**
 * POST /api/status — update bot status
 */
export async function updateStatus(
  bot_enabled: boolean
): Promise<{ status: string; bot_enabled: boolean }> {
  const res = await fetch(`${API_URL}/api/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_enabled }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

/**
 * GET /api/persona — get bot persona
 */
export async function fetchPersona(): Promise<any> {
  const res = await fetch(`${API_URL}/api/persona`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch persona");
  return res.json();
}

/**
 * POST /api/persona — update bot persona
 */
export async function updatePersona(data: any): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/api/persona`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update persona");
  return res.json();
}

/**
 * GET /api/users/:id — get user detail
 */
export async function fetchUserDetail(telegramId: number): Promise<UserProfile & { message_count: number; is_blocked: boolean }> {
  const res = await fetch(`${API_URL}/api/users/${telegramId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

/**
 * GET /api/users/:id/messages — get user messages
 */
export async function fetchUserMessages(telegramId: number): Promise<{ messages: MessageLog[] }> {
  const res = await fetch(`${API_URL}/api/users/${telegramId}/messages`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

/**
 * POST /api/users/:id/summary — update user summary
 */
export async function updateUserSummary(telegramId: number, summary: string): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/api/users/${telegramId}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) throw new Error("Failed to update summary");
  return res.json();
}

/**
 * POST /api/users/:id/block — block or unblock user
 */
export async function toggleBlockUser(telegramId: number, blocked: boolean): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/api/users/${telegramId}/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocked }),
  });
  if (!res.ok) throw new Error("Failed to toggle block");
  return res.json();
}

/**
 * POST /api/users/:id/regenerate-summary — force AI to regenerate
 */
export async function regenerateSummary(telegramId: number): Promise<{ status: string; summary?: string }> {
  const res = await fetch(`${API_URL}/api/users/${telegramId}/regenerate-summary`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to regenerate summary");
  return res.json();
}

/**
 * POST /api/users/:id/goal — set strategic targeted goal
 */
export async function updateUserGoal(
  telegramId: number, 
  goal: string, 
  strictness: string
): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/api/users/${telegramId}/goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      goal: goal || null, 
      strictness 
    }),
  });
  if (!res.ok) throw new Error("Failed to update goal");
  return res.json();
}
