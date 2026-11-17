/**
 * api.ts — Centralized API client for Ani v2 Multi-Tenant SaaS Backend
 * All requests go through the Next.js server-side proxy (/api/backend/*)
 * so session cookies are securely forwarded to FastAPI + Neon PostgreSQL.
 */

const BASE = "/api/backend";

export interface Stats {
  total_users: number;
  total_messages: number;
  bot_replies?: number;
  pending_drafts?: number;
  active_today?: number;
  usage_daily?: {
    day: string;
    replies_count: number;
    tokens_used: number;
    summaries_count: number;
  }[];
}

export interface UserProfile {
  telegram_id: number;
  username: string | null;
  first_name: string;
  lifestyle_summary: string;
  last_active: string;
  target_goal?: string | null;
  context_notes?: string | null;
  goal_strictness?: string;
  goal_mode?: string;
  ai_mode?: "default" | "on" | "off" | "draft";
  is_blocked?: boolean;
  is_allowlisted?: boolean;
  paused_until?: string | null;
  message_count?: number;
}

export interface MessageLog {
  id: string;
  telegram_id: number;
  role: "user" | "bot" | "owner";
  status?: "sent" | "draft" | "queued" | "discarded";
  content: string;
  created_at: string;
}

export interface TenantState {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    onboarding_completed: boolean;
    created_at: string;
  };
  agent: {
    enabled: boolean;
    model: string;
    has_groq_key: boolean;
    groq_key_mask: string | null;
    reply_mode: "auto" | "draft";
    audience: "everyone" | "allowlist";
    pause_minutes_after_manual: number;
    batch_seconds: number;
    respond_in_groups: boolean;
    handoff_keywords: string[];
    persona: any;
  };
  telegram: {
    status: "connected" | "disconnected" | "expired" | "error";
    is_live: boolean;
    tg_user_id: number | null;
    tg_username: string | null;
    tg_first_name: string | null;
    tg_phone: string | null;
    has_custom_api_id: boolean;
    platform_has_default_api_id: boolean;
    last_error: string | null;
    connected_at: string | null;
  };
}

export interface ActivityItem {
  id: string;
  event_type: string;
  telegram_id: number | null;
  contact_name: string | null;
  summary: string;
  created_at: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `Request failed (${res.status})`);
  }
  return data as T;
}

// ── Auth & Tenant State ──

export async function loginTenant(email: string, password: string): Promise<TenantState & { token: string }> {
  return requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function registerTenant(
  name: string,
  email: string,
  password: string
): Promise<TenantState & { token: string }> {
  return requestJson("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function logoutTenant(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: "POST" });
}

export async function fetchMe(): Promise<TenantState> {
  return requestJson("/auth/me");
}

export async function markOnboardingComplete(completed = true): Promise<{ status: string }> {
  return requestJson("/auth/onboarding-complete", {
    method: "POST",
    body: JSON.stringify({ completed }),
  });
}

// ── Dashboard & Stats ──

export async function fetchStats(): Promise<Stats> {
  return requestJson("/stats");
}

export async function fetchHealth(): Promise<{ status: string; bot_enabled: boolean }> {
  const me = await fetchMe();
  return { status: "ok", bot_enabled: me.agent.enabled };
}

export async function updateStatus(bot_enabled: boolean): Promise<{ status: string; bot_enabled: boolean }> {
  return requestJson("/status", {
    method: "POST",
    body: JSON.stringify({ bot_enabled }),
  });
}

// ── Groq BYOK Key & Models ──

export async function saveGroqKey(
  api_key: string,
  model?: string,
  validate_live = true
): Promise<{ status: string; has_groq_key: boolean; groq_key_mask: string | null; model: string }> {
  return requestJson("/settings/groq-key", {
    method: "POST",
    body: JSON.stringify({ api_key, model, validate_live }),
  });
}

export async function testGroqKey(api_key = ""): Promise<{ valid: boolean; detail: string }> {
  return requestJson("/settings/groq-key/test", {
    method: "POST",
    body: JSON.stringify({ api_key }),
  });
}

export async function fetchAvailableModels(): Promise<{
  models: { id: string; name: string; description: string }[];
  presets: Record<string, any>;
}> {
  return requestJson("/settings/models");
}

// ── Persona, Rules & Live Sandbox ──

export async function fetchPersona(): Promise<any> {
  return requestJson("/persona");
}

export async function updatePersona(data: any): Promise<{ status: string; persona: any }> {
  return requestJson("/persona", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchRules(): Promise<{
  enabled: boolean;
  model: string;
  reply_mode: "auto" | "draft";
  audience: "everyone" | "allowlist";
  pause_minutes_after_manual: number;
  batch_seconds: number;
  respond_in_groups: boolean;
  handoff_keywords: string[];
  has_groq_key: boolean;
  groq_key_mask: string | null;
}> {
  return requestJson("/rules");
}

export async function updateRules(data: Partial<{
  model: string;
  reply_mode: "auto" | "draft";
  audience: "everyone" | "allowlist";
  pause_minutes_after_manual: number;
  batch_seconds: number;
  respond_in_groups: boolean;
  handoff_keywords: string[];
}>): Promise<any> {
  return requestJson("/rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function previewAgentChat(data: {
  message: string;
  sender_name?: string;
  history?: { role: string; content: string }[];
  persona_override?: any;
}): Promise<{ reply: string; tokens: number }> {
  return requestJson("/agent/preview", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Telegram Connection (QR / Phone / StringSession) ──

export async function fetchTelegramStatus(): Promise<{
  status: string;
  is_live: boolean;
  tg_user_id: number | null;
  tg_username: string | null;
  tg_first_name: string | null;
  tg_phone: string | null;
  connected_at: string | null;
  last_error: string | null;
  pending_flow: {
    status: string;
    mode?: string;
    qr_url?: string;
    qr_image?: string;
    error?: string;
  };
  platform_has_default_api_id: boolean;
}> {
  return requestJson("/telegram/status");
}

export async function startTelegramQr(api_id?: number, api_hash?: string): Promise<{
  status: string;
  qr_url: string;
  qr_image: string;
}> {
  return requestJson("/telegram/qr/start", {
    method: "POST",
    body: JSON.stringify({ api_id: api_id || null, api_hash: api_hash || null }),
  });
}

export async function startTelegramPhone(
  phone: string,
  api_id?: number,
  api_hash?: string
): Promise<{ status: string; phone: string }> {
  return requestJson("/telegram/phone/start", {
    method: "POST",
    body: JSON.stringify({
      phone,
      api_id: api_id || null,
      api_hash: api_hash || null,
    }),
  });
}

export async function verifyTelegramCode(code: string): Promise<any> {
  return requestJson("/telegram/phone/verify-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function verifyTelegram2FA(password: string): Promise<any> {
  return requestJson("/telegram/verify-2fa", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function connectTelegramSessionString(
  session_string: string,
  api_id?: number,
  api_hash?: string
): Promise<any> {
  return requestJson("/telegram/session-string", {
    method: "POST",
    body: JSON.stringify({
      session_string,
      api_id: api_id || null,
      api_hash: api_hash || null,
    }),
  });
}

export async function disconnectTelegram(): Promise<{ status: string }> {
  return requestJson("/telegram/disconnect", { method: "POST" });
}

// ── Contacts, Messages, Drafts & CRM ──

export async function fetchUsers(limit = 200): Promise<{ users: UserProfile[] }> {
  return requestJson(`/users?limit=${limit}`);
}

export async function fetchUserDetail(
  telegramId: number
): Promise<UserProfile & { message_count: number; is_blocked: boolean }> {
  return requestJson(`/users/${telegramId}`);
}

export async function fetchUserMessages(
  telegramId: number
): Promise<{ messages: MessageLog[] }> {
  return requestJson(`/users/${telegramId}/messages`);
}

export async function fetchAllMessages(
  limit = 60,
  role?: "user" | "bot" | "owner",
  status?: string
): Promise<{ messages: MessageLog[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  return requestJson(`/messages?${params.toString()}`);
}

export async function sendManualMessage(data: {
  telegram_id: number;
  text: string;
}): Promise<{ status: string; delivery?: string; telegram_id?: number; text?: string; detail?: string }> {
  return requestJson("/manual-message", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateUserSummary(
  telegramId: number,
  summary: string
): Promise<{ status: string }> {
  return requestJson(`/users/${telegramId}/summary`, {
    method: "POST",
    body: JSON.stringify({ summary }),
  });
}

export async function toggleBlockUser(
  telegramId: number,
  blocked: boolean
): Promise<{ status: string }> {
  return requestJson(`/users/${telegramId}/block`, {
    method: "POST",
    body: JSON.stringify({ blocked }),
  });
}

export async function regenerateSummary(
  telegramId: number
): Promise<{ status: string; summary?: string }> {
  return requestJson(`/users/${telegramId}/regenerate-summary`, {
    method: "POST",
  });
}

export async function updateUserGoal(
  telegramId: number,
  goal: string,
  strictness: string
): Promise<{ status: string }> {
  return requestJson(`/users/${telegramId}/goal`, {
    method: "POST",
    body: JSON.stringify({ goal: goal || null, strictness }),
  });
}

export async function updateContactControls(
  telegramId: number,
  data: {
    ai_mode?: "default" | "on" | "off" | "draft";
    is_allowlisted?: boolean;
    pause_minutes?: number;
  }
): Promise<{ status: string; contact: UserProfile }> {
  return requestJson(`/users/${telegramId}/controls`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function approveDraftMessage(
  messageId: string,
  content?: string
): Promise<{ status: string; content: string; detail?: string }> {
  return requestJson(`/drafts/${messageId}/approve`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function discardDraftMessage(messageId: string): Promise<{ status: string }> {
  return requestJson(`/drafts/${messageId}/discard`, {
    method: "POST",
  });
}

export async function simulateIncomingMessage(data: {
  telegram_id?: number;
  first_name?: string;
  username?: string;
  text: string;
}): Promise<{ status: string; contact: UserProfile; messages: MessageLog[] }> {
  return requestJson("/users/simulate-incoming", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchActivityFeed(limit = 40): Promise<{ activities: ActivityItem[] }> {
  return requestJson(`/activity?limit=${limit}`);
}
