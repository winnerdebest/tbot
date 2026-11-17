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
  updateContactControls,
  approveDraftMessage,
  discardDraftMessage,
  type MessageLog,
  type UserProfile,
} from "@/lib/api";
import {
  Lock,
  Unlock,
  Edit2,
  RotateCw,
  Loader2,
  Brain,
  Target,
  MessageSquare,
  Activity,
  UserX,
  CheckCircle,
  Check,
  X,
  PauseCircle,
  PlayCircle,
  FileEdit,
} from "lucide-react";

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

  // Draft editing state
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEditContent, setDraftEditContent] = useState("");

  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadData = async () => {
    try {
      const [userData, msgData] = await Promise.all([
        fetchUserDetail(telegramId),
        fetchUserMessages(telegramId),
      ]);
      setUser(userData);
      setMessages(msgData.messages);
      setSummaryDraft(userData.lifestyle_summary);
      setGoalDraft(userData.target_goal || userData.context_notes || "");
      setStrictnessDraft(userData.goal_strictness || userData.goal_mode || "balanced");
    } catch (err) {
      console.error("Failed to load user data:", err);
      showToast("error", "Failed to load contact data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
            role: "owner",
            status: "sent",
            content: messageText.trim(),
            created_at: new Date().toISOString(),
          },
        ]);
        setMessageText("");
        showToast("success", "Message sent & AI auto-paused for this chat ✓");
      } else {
        showToast("error", result.detail || "Failed to send");
      }
    } catch {
      showToast("error", "Connection failed");
    } finally {
      setSending(false);
    }
  };

  const handleSaveSummary = async () => {
    setSavingSummary(true);
    try {
      await updateUserSummary(telegramId, summaryDraft);
      setUser((prev) =>
        prev ? { ...prev, lifestyle_summary: summaryDraft } : prev
      );
      setEditingSummary(false);
      showToast("success", "Memory summary updated ✓");
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
      setUser((prev) =>
        prev
          ? {
              ...prev,
              target_goal: goalDraft || null,
              context_notes: goalDraft || null,
              goal_strictness: strictnessDraft,
            }
          : prev
      );
      setEditingGoal(false);
      showToast("success", "Context note updated ✓");
    } catch {
      showToast("error", "Failed to update note");
    } finally {
      setSavingGoal(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!user) return;
    try {
      await toggleBlockUser(telegramId, !user.is_blocked);
      setUser((prev) =>
        prev ? { ...prev, is_blocked: !prev.is_blocked } : prev
      );
      showToast("success", user.is_blocked ? "Contact unblocked" : "Contact blocked");
    } catch {
      showToast("error", "Failed to toggle block");
    }
  };

  const handleChangeAiMode = async (mode: "default" | "on" | "off" | "draft") => {
    try {
      const res = await updateContactControls(telegramId, { ai_mode: mode });
      setUser((prev) => (prev ? { ...prev, ...res.contact } : prev));
      showToast("success", `Chat AI mode set to ${mode.toUpperCase()}`);
    } catch {
      showToast("error", "Failed to update AI mode");
    }
  };

  const handlePauseToggle = async () => {
    if (!user) return;
    const isPaused =
      user.paused_until && new Date(user.paused_until) > new Date();
    try {
      const res = await updateContactControls(telegramId, {
        pause_minutes: isPaused ? 0 : 60,
      });
      setUser((prev) => (prev ? { ...prev, ...res.contact } : prev));
      showToast(
        "success",
        isPaused ? "AI resumed for this contact" : "AI paused for 60 minutes"
      );
    } catch {
      showToast("error", "Failed to update pause state");
    }
  };

  const handleApproveDraft = async (msgId: string, customText?: string) => {
    try {
      await approveDraftMessage(msgId, customText);
      setEditingDraftId(null);
      await loadData();
      showToast("success", "Draft approved & sent ✓");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to approve draft");
    }
  };

  const handleDiscardDraft = async (msgId: string) => {
    try {
      await discardDraftMessage(msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      showToast("success", "Draft discarded");
    } catch {
      showToast("error", "Failed to discard draft");
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await regenerateSummary(telegramId);
      if (result.status === "ok" && result.summary) {
        setUser((prev) =>
          prev ? { ...prev, lifestyle_summary: result.summary! } : prev
        );
        setSummaryDraft(result.summary);
        showToast("success", "Summary regenerated ✓");
      } else {
        showToast("error", "Failed to regenerate");
      }
    } catch (err: any) {
      showToast("error", err?.message || "Failed — check your Groq API key");
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
          <div
            className="skeleton skeleton-text"
            style={{ width: 300, marginTop: 8 }}
          />
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
          <div className="empty-state-icon">
            <UserX size={32} />
          </div>
          <p className="empty-state-text">Contact not found</p>
          <Link href="/users">
            <button className="btn btn-secondary" style={{ marginTop: 16 }}>
              ← Back to Inbox
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const isPaused = Boolean(
    user.paused_until && new Date(user.paused_until) > new Date()
  );

  return (
    <div className="fade-in">
      {/* Header */}
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Link
            href="/users"
            className="text-sm text-muted"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 8,
            }}
          >
            ← Back to Inbox
          </Link>
          <h1
            className="page-title"
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <span className="user-detail-avatar">
              {user.first_name.charAt(0).toUpperCase()}
            </span>
            {user.first_name}
            {user.is_blocked && <span className="blocked-badge">Blocked</span>}
          </h1>
          <p className="page-subtitle">
            {user.username ? `@${user.username}` : "No username"} · ID:{" "}
            {user.telegram_id} · {user.message_count} messages
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            className="form-input"
            value={user.ai_mode || "default"}
            onChange={(e) => handleChangeAiMode(e.target.value as any)}
            style={{ width: "auto", fontSize: 13, padding: "8px 12px", appearance: "auto" }}
          >
            <option value="default">Mode: Global Default</option>
            <option value="on">Always Auto-Reply</option>
            <option value="draft">Draft Approval Mode</option>
            <option value="off">AI Disabled for Contact</option>
          </select>

          <button
            onClick={handlePauseToggle}
            className="btn btn-secondary"
            style={{ fontSize: 13, padding: "8px 14px" }}
          >
            {isPaused ? (
              <>
                <PlayCircle size={14} color="var(--emerald)" /> Resume AI
              </>
            ) : (
              <>
                <PauseCircle size={14} /> Snooze 1h
              </>
            )}
          </button>

          <button
            onClick={handleToggleBlock}
            className={`btn ${user.is_blocked ? "btn-primary" : "btn-danger"}`}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {user.is_blocked ? (
              <>
                <Unlock size={14} /> Unblock
              </>
            ) : (
              <>
                <Lock size={14} /> Block
              </>
            )}
          </button>
        </div>
      </div>

      {/* CRM Layout */}
      <div className="crm-layout">
        {/* Left Column — Contact Info & Memory */}
        <div className="crm-sidebar">
          <div className="glass-card">
            <h3
              className="glass-card-title"
              style={{
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Activity size={18} /> Contact Status
            </h3>
            <div className="crm-stat-row">
              <span className="text-sm text-muted">Total Messages</span>
              <span style={{ fontWeight: 700, fontSize: 18 }}>
                {user.message_count}
              </span>
            </div>
            <div className="crm-stat-row">
              <span className="text-sm text-muted">Last Active</span>
              <span className="text-sm">{formatDate(user.last_active)}</span>
            </div>
            <div className="crm-stat-row">
              <span className="text-sm text-muted">AI Status</span>
              <span className="text-sm">
                {user.is_blocked ? (
                  <span
                    style={{
                      color: "var(--accent-rose)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Lock size={14} /> Blocked
                  </span>
                ) : isPaused ? (
                  <span style={{ color: "var(--amber)" }}>
                    Snoozed until {formatTime(user.paused_until!)}
                  </span>
                ) : (
                  <span
                    style={{
                      color: "var(--accent-emerald)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <CheckCircle size={14} /> Active ({user.ai_mode || "default"})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Context Notes & Goal */}
          <div className="glass-card" style={{ marginBottom: 16 }}>
            <div className="glass-card-header">
              <h3
                className="glass-card-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Target size={18} /> Contact Notes & Goal
              </h3>
              <button
                onClick={() => {
                  setEditingGoal(!editingGoal);
                  setGoalDraft(user.target_goal || user.context_notes || "");
                  setStrictnessDraft(
                    user.goal_strictness || user.goal_mode || "balanced"
                  );
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
                  placeholder="e.g. Find out what time works for dinner on Friday..."
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
                  <option value="subtle">Subtle / Natural</option>
                  <option value="balanced">Balanced</option>
                  <option value="direct">Direct / Proactive</option>
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSaveGoal}
                    disabled={savingGoal}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "8px 16px" }}
                  >
                    {savingGoal ? "Saving..." : "Save Note"}
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
                {user.target_goal || user.context_notes ? (
                  <>
                    <p
                      className="text-sm"
                      style={{
                        color: "var(--text-1)",
                        lineHeight: 1.7,
                        marginBottom: 8,
                      }}
                    >
                      {user.target_goal || user.context_notes}
                    </p>
                    <span className="glass-card-badge" style={{ fontSize: 10 }}>
                      Approach:{" "}
                      {(
                        user.goal_strictness ||
                        user.goal_mode ||
                        "balanced"
                      ).toUpperCase()}
                    </span>
                  </>
                ) : (
                  <p
                    className="text-sm text-muted"
                    style={{ fontStyle: "italic" }}
                  >
                    No custom note set. AI replies naturally using your persona.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Lifestyle / Memory Summary */}
          <div className="glass-card">
            <div className="glass-card-header">
              <h3
                className="glass-card-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Brain size={18} /> AI Memory Summary
              </h3>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                >
                  {regenerating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCw size={12} />
                  )}{" "}
                  Regen
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
              <p
                className="text-sm"
                style={{ color: "var(--text-1)", lineHeight: 1.7 }}
              >
                {user.lifestyle_summary}
              </p>
            )}
          </div>
        </div>

        {/* Right Column — Conversation & Draft Approval */}
        <div
          className="crm-chat-container glass-card"
          style={{ padding: 0, display: "flex", flexDirection: "column" }}
        >
          <div className="crm-chat-header">
            <h3
              className="glass-card-title"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <MessageSquare size={18} /> Conversation
            </h3>
            <span className="glass-card-badge">{messages.length} messages</span>
          </div>

          <div className="crm-chat-messages">
            {messages.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 20px" }}>
                <div className="empty-state-icon">
                  <MessageSquare size={32} />
                </div>
                <p className="empty-state-text">No messages yet</p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const isBotOrOwner = msg.role === "bot" || msg.role === "owner";
                const isDraft = msg.status === "draft";
                return (
                  <div
                    key={msg.id}
                    className={`crm-msg ${
                      isBotOrOwner ? "crm-msg-bot" : "crm-msg-user"
                    }`}
                    style={{ animationDelay: `${Math.min(i * 0.02, 0.5)}s` }}
                  >
                    <div
                      className="crm-msg-bubble"
                      style={
                        isDraft
                          ? {
                              border: "1px dashed var(--amber)",
                              background: "rgba(252, 211, 77, 0.12)",
                            }
                          : undefined
                      }
                    >
                      <div
                        style={{
                          fontSize: 10.5,
                          opacity: 0.85,
                          marginBottom: 4,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        {isDraft ? (
                          <>
                            <FileEdit size={12} color="var(--amber)" />
                            <span>AI DRAFT (Awaiting Your Approval)</span>
                          </>
                        ) : msg.role === "owner" ? (
                          "You (Sent Manually)"
                        ) : msg.role === "bot" ? (
                          "AI Agent"
                        ) : (
                          user.first_name
                        )}
                      </div>

                      {editingDraftId === msg.id ? (
                        <div style={{ marginTop: 6 }}>
                          <textarea
                            className="form-input"
                            rows={3}
                            value={draftEditContent}
                            onChange={(e) => setDraftEditContent(e.target.value)}
                            style={{ fontSize: 13, marginBottom: 8 }}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: "5px 10px", fontSize: 11 }}
                              onClick={() =>
                                handleApproveDraft(msg.id, draftEditContent)
                              }
                            >
                              Send Edited
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "5px 10px", fontSize: 11 }}
                              onClick={() => setEditingDraftId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="crm-msg-text">{msg.content}</p>
                      )}

                      <span className="crm-msg-time">
                        {formatTime(msg.created_at)}
                      </span>

                      {isDraft && editingDraftId !== msg.id && (
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: "1px solid var(--border)",
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: "5px 10px", fontSize: 11 }}
                            onClick={() => handleApproveDraft(msg.id)}
                          >
                            <Check size={12} /> Approve & Send
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "5px 10px", fontSize: 11 }}
                            onClick={() => {
                              setEditingDraftId(msg.id);
                              setDraftEditContent(msg.content);
                            }}
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: "5px 10px", fontSize: 11 }}
                            onClick={() => handleDiscardDraft(msg.id)}
                          >
                            <X size={12} /> Discard
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="crm-chat-input" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="form-input"
              placeholder={
                user.is_blocked
                  ? "Contact is blocked"
                  : "Send a manual message as yourself (auto-pauses AI)..."
              }
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

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
