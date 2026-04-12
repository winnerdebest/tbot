"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  fetchUserDetail,
  fetchUserMessages,
  sendManualMessage,
  updateUserSummary,
  updateUserGoal,
  toggleBlockUser,
  regenerateSummary,
  type MessageLog,
  type UserProfile,
} from "@/lib/api";
import { CopyX, Lock, Unlock, Edit2, RotateCw, Loader2, Brain, Target, MessageSquare, Activity, UserX, CheckCircle } from 'lucide-react';

interface UserDetail extends UserProfile {
  message_count: number;
  is_blocked: boolean;
}

export default function UserDetailPage() {
  const params = useParams();
  const telegramId = Number(params.id);

  const [user, setUser] = useState<UserDetail | null>(null);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [strictnessDraft, setStrictnessDraft] = useState("balanced");
  const [savingGoal, setSavingGoal] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userData, msgData] = await Promise.all([
          fetchUserDetail(telegramId),
          fetchUserMessages(telegramId),
        ]);
        setUser(userData);
        setMessages(msgData.messages);
        setSummaryDraft(userData.lifestyle_summary);
        setGoalDraft(userData.target_goal || "");
        setStrictnessDraft(userData.goal_strictness || "balanced");
      } catch (err) {
        console.error("Failed to load user data:", err);
        showToast("error", "Failed to load user data — is the bot running?");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [telegramId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setSending(true);
    try {
      const result = await sendManualMessage({
        telegram_id: telegramId,
        text: messageText.trim(),
      });
      if (result.status === "sent") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            telegram_id: telegramId,
            role: "bot",
            content: messageText.trim(),
            created_at: new Date().toISOString(),
          },
        ]);
        setMessageText("");
        showToast("success", "Message sent ✓");
      } else {
        showToast("error", result.detail || "Failed to send");
      }
    } catch {
      showToast("error", "Connection failed — is the bot running?");
    } finally {
      setSending(false);
    }
  };

  const handleSaveSummary = async () => {
    setSavingSummary(true);
    try {
      await updateUserSummary(telegramId, summaryDraft);
      setUser((prev) => (prev ? { ...prev, lifestyle_summary: summaryDraft } : prev));
      setEditingSummary(false);
      showToast("success", "Summary updated ✓");
    } catch {
      showToast("error", "Failed to update summary");
    } finally {
      setSavingSummary(false);
    }
  };

  const handleSaveGoal = async () => {
    setSavingGoal(true);
    try {
      await updateUserGoal(telegramId, goalDraft, strictnessDraft);
      setUser((prev) => (prev ? { ...prev, target_goal: goalDraft || null, goal_strictness: strictnessDraft } : prev));
      setEditingGoal(false);
      showToast("success", "Goal updated ✓");
    } catch {
      showToast("error", "Failed to update goal");
    } finally {
      setSavingGoal(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!user) return;
    try {
      await toggleBlockUser(telegramId, !user.is_blocked);
      setUser((prev) => (prev ? { ...prev, is_blocked: !prev.is_blocked } : prev));
      showToast("success", user.is_blocked ? "User unblocked" : "User blocked");
    } catch {
      showToast("error", "Failed to toggle block");
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await regenerateSummary(telegramId);
      if (result.status === "ok" && result.summary) {
        setUser((prev) => (prev ? { ...prev, lifestyle_summary: result.summary! } : prev));
        setSummaryDraft(result.summary);
        showToast("success", "Summary regenerated ✓");
      } else {
        showToast("error", "Failed to regenerate");
      }
    } catch {
      showToast("error", "Failed — is the AI API configured?");
    } finally {
      setRegenerating(false);
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="page-header">
          <div className="skeleton skeleton-text" style={{ width: 200 }} />
          <div className="skeleton skeleton-text" style={{ width: 300, marginTop: 8 }} />
        </div>
        <div className="crm-layout">
          <div className="glass-card" style={{ height: 400 }}>
            <div className="skeleton skeleton-lg" />
          </div>
          <div className="glass-card" style={{ height: 400 }}>
            <div className="skeleton skeleton-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fade-in">
        <div className="empty-state">
          <div className="empty-state-icon"><UserX size={32} /></div>
          <p className="empty-state-text">User not found</p>
          <Link href="/users">
            <button className="btn btn-secondary" style={{ marginTop: 16 }}>
              ← Back to Users
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Link href="/users" className="text-sm text-muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
            ← Back to Users
          </Link>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="user-detail-avatar">
              {user.first_name.charAt(0).toUpperCase()}
            </span>
            {user.first_name}
            {user.is_blocked && <span className="blocked-badge">Blocked</span>}
          </h1>
          <p className="page-subtitle">
            {user.username ? `@${user.username}` : "No username"} · ID: {user.telegram_id} · {user.message_count} messages
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleToggleBlock}
            className={`btn ${user.is_blocked ? "btn-primary" : "btn-danger"}`}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {user.is_blocked ? <><Unlock size={14} /> Unblock</> : <><Lock size={14} /> Block User</>}
          </button>
        </div>
      </div>

      {/* CRM Layout */}
      <div className="crm-layout">
        {/* Left Column — User Info */}
        <div className="crm-sidebar">
          {/* Stats */}
          <div className="glass-card">
            <h3 className="glass-card-title" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}><Activity size={18} /> Quick Stats</h3>
            <div className="crm-stat-row">
              <span className="text-sm text-muted">Total Messages</span>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{user.message_count}</span>
            </div>
            <div className="crm-stat-row">
              <span className="text-sm text-muted">Last Active</span>
              <span className="text-sm">{formatDate(user.last_active)}</span>
            </div>
            <div className="crm-stat-row">
              <span className="text-sm text-muted">Status</span>
              <span className="text-sm">
                {user.is_blocked ? (
                  <span style={{ color: "var(--accent-rose)", display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={14} /> Blocked</span>
                ) : (
                  <span style={{ color: "var(--accent-emerald)", display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> Active</span>
                )}
              </span>
            </div>
          </div>

          {/* Strategic Goal */}
          <div className="glass-card" style={{ marginBottom: 16 }}>
            <div className="glass-card-header">
              <h3 className="glass-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Target size={18} /> Strategic Goal</h3>
              <button
                onClick={() => {
                  setEditingGoal(!editingGoal);
                  setGoalDraft(user.target_goal || "");
                  setStrictnessDraft(user.goal_strictness || "balanced");
                }}
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: "4px 10px" }}
              >
                <Edit2 size={12} /> Edit
              </button>
            </div>

            {editingGoal ? (
              <div>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Make the user trust you and feel loved..."
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  disabled={savingGoal}
                  style={{ fontSize: 13, marginBottom: 12 }}
                />
                <select
                  className="form-input"
                  value={strictnessDraft}
                  onChange={(e) => setStrictnessDraft(e.target.value)}
                  disabled={savingGoal}
                  style={{ fontSize: 13, marginBottom: 12, appearance: "auto" }}
                >
                  <option value="subtle">Low (Subtle / Patient)</option>
                  <option value="balanced">Medium (Balanced)</option>
                  <option value="aggressive">High (Aggressive / Direct)</option>
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSaveGoal}
                    disabled={savingGoal}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "8px 16px" }}
                  >
                    {savingGoal ? "Saving..." : "Save Goal"}
                  </button>
                  <button
                    onClick={() => setEditingGoal(false)}
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: "8px 16px" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {user.target_goal ? (
                  <>
                    <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 8 }}>
                      {user.target_goal}
                    </p>
                    <span className="glass-card-badge" style={{ fontSize: 10 }}>
                      Strategy: {user.goal_strictness?.toUpperCase() || 'BALANCED'}
                    </span>
                  </>
                ) : (
                  <p className="text-sm text-muted" style={{ fontStyle: "italic" }}>
                    No goal set. AI will act normally.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Lifestyle Summary */}
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Brain size={18} /> AI Summary</h3>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                >
                  {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />} Regen
                </button>
                <button
                  onClick={() => {
                    setEditingSummary(!editingSummary);
                    setSummaryDraft(user.lifestyle_summary);
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                >
                  <Edit2 size={12} /> Edit
                </button>
              </div>
            </div>

            {editingSummary ? (
              <div>
                <textarea
                  className="form-input"
                  rows={5}
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  disabled={savingSummary}
                  style={{ fontSize: 13, marginBottom: 12 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSaveSummary}
                    disabled={savingSummary}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "8px 16px" }}
                  >
                    {savingSummary ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingSummary(false)}
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: "8px 16px" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {user.lifestyle_summary}
              </p>
            )}
          </div>
        </div>

        {/* Right Column — Chat */}
        <div className="crm-chat-container glass-card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          {/* Chat Header */}
          <div className="crm-chat-header">
            <h3 className="glass-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquare size={18} /> Conversation</h3>
            <span className="glass-card-badge">{messages.length} messages</span>
          </div>

          {/* Chat Messages */}
          <div className="crm-chat-messages">
            {messages.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 20px" }}>
                <div className="empty-state-icon"><MessageSquare size={32} /></div>
                <p className="empty-state-text">No messages yet</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={msg.id}
                  className={`crm-msg ${msg.role === "bot" ? "crm-msg-bot" : "crm-msg-user"}`}
                  style={{ animationDelay: `${Math.min(i * 0.02, 0.5)}s` }}
                >
                  <div className="crm-msg-bubble">
                    <p className="crm-msg-text">{msg.content}</p>
                    <span className="crm-msg-time">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <form className="crm-chat-input" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="form-input"
              placeholder={user.is_blocked ? "User is blocked" : "Type a message..."}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              disabled={sending || user.is_blocked}
              style={{ borderRadius: 24, flex: 1 }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending || !messageText.trim() || user.is_blocked}
              style={{ borderRadius: 24, padding: "12px 20px" }}
            >
              {sending ? "..." : "Send"}
            </button>
          </form>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
