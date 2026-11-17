"use client";

import { useEffect, useState } from "react";
import { fetchAllMessages, type MessageLog } from "@/lib/api";
import { List, User, Bot, MessageSquare } from "lucide-react";

export default function MessagesPage() {
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<"all" | "user" | "bot">("all");

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const res = await fetchAllMessages(
          60,
          filterRole === "all" ? undefined : filterRole
        );
        setMessages(res.messages || []);
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [filterRole]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Message Log</h1>
        <p className="page-subtitle">
          Complete conversation log across all contacts for your account
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["all", "user", "bot"] as const).map((role) => (
          <button
            key={role}
            className={
              filterRole === role ? "btn btn-primary" : "btn btn-secondary"
            }
            onClick={() => {
              setLoading(true);
              setFilterRole(role);
            }}
            style={{ padding: "8px 16px", fontSize: 13 }}
          >
            {role === "all" ? (
              <>
                <List size={14} /> All
              </>
            ) : role === "user" ? (
              <>
                <User size={14} /> Contacts
              </>
            ) : (
              <>
                <Bot size={14} /> AI Replies
              </>
            )}
          </button>
        ))}
      </div>

      <div className="glass-card">
        <div className="glass-card-header">
          <h2 className="glass-card-title">Message History</h2>
          <span className="glass-card-badge">{messages.length} shown</span>
        </div>

        {loading ? (
          <div>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="skeleton skeleton-text"
                style={{ width: `${85 - i * 5}%`, marginBottom: 16 }}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <MessageSquare size={32} />
            </div>
            <p className="empty-state-text">
              No messages found yet.
            </p>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((msg, i) => (
              <div
                key={msg.id}
                className="message-bubble"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                <div
                  className={`message-avatar ${
                    msg.role === "bot" || msg.role === "owner"
                      ? "bot-avatar"
                      : "user-avatar"
                  }`}
                >
                  {msg.role === "bot" ? <Bot size={16} /> : <User size={16} />}
                </div>
                <div className="message-content">
                  <div className="message-meta">
                    <span
                      className={`message-role ${
                        msg.role === "bot" ? "bot-role" : "user-role"
                      }`}
                    >
                      {msg.role === "bot"
                        ? msg.status === "draft"
                          ? "AI Draft"
                          : "AI Agent"
                        : msg.role === "owner"
                        ? "You (Manual)"
                        : "Contact"}
                    </span>
                    <span className="font-mono text-sm text-muted">
                      ID: {msg.telegram_id}
                    </span>
                    <span className="message-time">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="message-text">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
