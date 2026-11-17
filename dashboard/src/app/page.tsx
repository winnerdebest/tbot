"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchStats,
  fetchUsers,
  fetchAllMessages,
  fetchActivityFeed,
  fetchMe,
  simulateIncomingMessage,
  type Stats,
  type MessageLog,
  type UserProfile,
  type ActivityItem,
  type TenantState,
} from "@/lib/api";
import {
  Users,
  MessageSquare,
  Activity,
  Bot,
  User,
  Sparkles,
  FileEdit,
  Plug,
  Send,
} from "lucide-react";

export default function OverviewPage() {
  const [tenant, setTenant] = useState<TenantState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentMessages, setRecentMessages] = useState<MessageLog[]>([]);
  const [recentUsers, setRecentUsers] = useState<UserProfile[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const loadData = async () => {
    try {
      const [meData, statsData, msgRes, usersRes, actRes] = await Promise.all([
        fetchMe(),
        fetchStats(),
        fetchAllMessages(8),
        fetchUsers(6),
        fetchActivityFeed(6),
      ]);
      setTenant(meData);
      setStats(statsData);
      setRecentMessages(msgRes.messages || []);
      setRecentUsers(usersRes.users || []);
      setActivities(actRes.activities || []);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulateDemo = async () => {
    setSimulating(true);
    try {
      await simulateIncomingMessage({
        telegram_id: 777000,
        first_name: "Jordan (Demo Contact)",
        username: "jordan_demo",
        text: "Hey! Just checking in — are you free to catch up this week?",
      });
      await loadData();
    } catch (err) {
      console.error("Demo simulation failed:", err);
    } finally {
      setSimulating(false);
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

  const tgConnected = tenant?.telegram.status === "connected";
  const groqConnected = tenant?.agent.has_groq_key;

  return (
    <div className="fade-in">
      {/* Page Header */}
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
          <h1 className="page-title">
            Welcome back{tenant ? `, ${tenant.user.name}` : ""}
          </h1>
          <p className="page-subtitle">
            Real-time overview of your personal Telegram AI agent, memory & inbox
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {groqConnected && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSimulateDemo}
              disabled={simulating}
              style={{ fontSize: 13 }}
            >
              <Send size={14} />
              {simulating ? "Simulating..." : "Simulate Incoming Chat"}
            </button>
          )}
          <Link href="/connect" className="btn btn-primary" style={{ fontSize: 13 }}>
            <Plug size={14} />
            {tgConnected ? "Manage Connections" : "Connect Telegram"}
          </Link>
        </div>
      </div>

      {/* Onboarding Prompt Banner if either Groq or Telegram isn't connected yet */}
      {tenant && (!tgConnected || !groqConnected) && (
        <div
          className="glass-card"
          style={{
            marginBottom: 24,
            background: "var(--bg-2)",
            borderColor: "var(--border-hover)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} color="var(--emerald)" />
              Finish connecting your AI Agent
            </h3>
            <p className="text-sm" style={{ color: "var(--text-1)" }}>
              {!groqConnected && !tgConnected
                ? "Add your Groq API key and link your Telegram account (QR or Phone) to start answering chats automatically."
                : !groqConnected
                ? "Add your Groq API key so your agent can generate replies and contact memories."
                : "Link your Telegram account via QR or Phone code (no Telegram Premium needed) to go live."}
            </p>
          </div>
          <Link href="/onboarding" className="btn btn-primary">
            Open Setup Wizard →
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card purple">
          <div className="stat-card-header">
            <div className="stat-card-icon purple">
              <Users size={20} />
            </div>
            <span className="stat-card-label">Total Contacts</span>
          </div>
          {loading ? (
            <div className="skeleton skeleton-lg" />
          ) : (
            <div className="stat-card-value">{stats?.total_users ?? 0}</div>
          )}
        </div>

        <div className="stat-card blue">
          <div className="stat-card-header">
            <div className="stat-card-icon blue">
              <MessageSquare size={20} />
            </div>
            <span className="stat-card-label">Total Messages</span>
          </div>
          {loading ? (
            <div className="skeleton skeleton-lg" />
          ) : (
            <div className="stat-card-value">{stats?.total_messages ?? 0}</div>
          )}
        </div>

        <div className="stat-card emerald">
          <div className="stat-card-header">
            <div className="stat-card-icon emerald">
              <Bot size={20} />
            </div>
            <span className="stat-card-label">AI Replies Sent</span>
          </div>
          {loading ? (
            <div className="skeleton skeleton-lg" />
          ) : (
            <div className="stat-card-value">{stats?.bot_replies ?? 0}</div>
          )}
        </div>

        <div className="stat-card amber">
          <div className="stat-card-header">
            <div className="stat-card-icon amber">
              <FileEdit size={20} />
            </div>
            <span className="stat-card-label">Pending Drafts</span>
          </div>
          {loading ? (
            <div className="skeleton skeleton-lg" />
          ) : (
            <div className="stat-card-value">{stats?.pending_drafts ?? 0}</div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="two-column">
        {/* Recent Messages */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title">Recent Conversation Activity</h2>
            <span className="glass-card-badge">Live</span>
          </div>
          {loading ? (
            <div>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="skeleton skeleton-text"
                  style={{ width: `${80 - i * 10}%`, marginBottom: 12 }}
                />
              ))}
            </div>
          ) : recentMessages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <MessageSquare size={32} />
              </div>
              <p className="empty-state-text">
                No messages yet. Connect Telegram or click &quot;Simulate Incoming Chat&quot; above to test!
              </p>
            </div>
          ) : (
            <div className="message-list">
              {recentMessages.slice(0, 6).map((msg) => (
                <Link
                  key={msg.id}
                  href={`/users/${msg.telegram_id}`}
                  className="message-bubble"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    className={`message-avatar ${
                      msg.role === "bot" || msg.role === "owner"
                        ? "bot-avatar"
                        : "user-avatar"
                    }`}
                  >
                    {msg.role === "bot" ? (
                      <Bot size={16} />
                    ) : (
                      <User size={16} />
                    )}
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
                            ? "AI Draft (Needs Approval)"
                            : "AI Agent"
                          : msg.role === "owner"
                          ? "You (Manual)"
                          : `Contact #${msg.telegram_id}`}
                      </span>
                      <span className="message-time">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="message-text">
                      {msg.content.length > 120
                        ? msg.content.slice(0, 120) + "…"
                        : msg.content}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Contacts */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title">Active Contacts</h2>
            <Link href="/users" className="glass-card-badge">
              View All ({recentUsers.length}) →
            </Link>
          </div>
          {loading ? (
            <div>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="skeleton skeleton-text"
                  style={{ width: `${90 - i * 15}%`, marginBottom: 12 }}
                />
              ))}
            </div>
          ) : recentUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users size={32} />
              </div>
              <p className="empty-state-text">
                No contacts yet. They&apos;ll appear automatically as people message your Telegram.
              </p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Mode</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map((user) => (
                    <tr key={user.telegram_id}>
                      <td>
                        <Link
                          href={`/users/${user.telegram_id}`}
                          className="user-tag"
                        >
                          <div className="user-tag-avatar">
                            {user.first_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="user-tag-name">{user.first_name}</div>
                            <div className="user-tag-username">
                              {user.username
                                ? `@${user.username}`
                                : `ID: ${user.telegram_id}`}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <span className="glass-card-badge" style={{ fontSize: 11 }}>
                          {user.is_blocked
                            ? "Blocked"
                            : user.ai_mode === "draft"
                            ? "Draft"
                            : user.ai_mode === "off"
                            ? "AI Off"
                            : "Auto"}
                        </span>
                      </td>
                      <td className="text-sm text-muted">
                        {formatTime(user.last_active)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      {activities.length > 0 && (
        <div className="glass-card" style={{ marginTop: 24 }}>
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={18} color="var(--purple)" />
              Agent Action Log
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activities.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--bg-2)",
                  fontSize: 13,
                }}
              >
                <span>{a.summary}</span>
                <span className="text-sm text-muted">
                  {formatTime(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
