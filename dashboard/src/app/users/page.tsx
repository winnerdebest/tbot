"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchUsers, simulateIncomingMessage, type UserProfile } from "@/lib/api";
import { Users, ChevronRight, Send, Zap, FileEdit, PauseCircle, Ban } from "lucide-react";

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const loadUsers = async () => {
    try {
      const res = await fetchUsers(200);
      setUsers(res.users || []);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSimulateContact = async () => {
    setSimulating(true);
    try {
      await simulateIncomingMessage({
        telegram_id: 777000,
        first_name: "Jordan (Demo Contact)",
        username: "jordan_demo",
        text: "Hey! Are we still on for coffee tomorrow afternoon?",
      });
      await loadUsers();
    } catch (err) {
      console.error("Simulate failed:", err);
    } finally {
      setSimulating(false);
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTimeShort = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="fade-in">
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
          <h1 className="page-title">Inbox & Contacts</h1>
          <p className="page-subtitle">
            All Telegram contacts who have chatted with your AI agent — click any contact to open their inbox, drafts & memory
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleSimulateContact}
          disabled={simulating}
          style={{ fontSize: 13 }}
        >
          <Send size={14} />
          {simulating ? "Simulating..." : "Simulate Demo Contact Chat"}
        </button>
      </div>

      <div className="glass-card">
        <div className="glass-card-header">
          <h2 className="glass-card-title">Contact Profiles</h2>
          <span className="glass-card-badge">{users.length} total</span>
        </div>

        {loading ? (
          <div>
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="skeleton skeleton-text"
                style={{ width: `${90 - i * 8}%`, marginBottom: 16 }}
              />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Users size={32} />
            </div>
            <p className="empty-state-text">
              No contacts yet. Click &quot;Simulate Demo Contact Chat&quot; above or connect Telegram to start!
            </p>
          </div>
        ) : (
          <>
            <div
              className="data-table-wrapper"
              style={{ display: "none" }}
              data-desktop
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>AI Mode</th>
                    <th>Memory Summary</th>
                    <th>Last Active</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.telegram_id}>
                      <td>
                        <Link
                          href={`/users/${user.telegram_id}`}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <div className="user-tag">
                            <div className="user-tag-avatar">
                              {user.first_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="user-tag-name">
                                {user.first_name}
                              </div>
                              <div className="user-tag-username">
                                {user.username
                                  ? `@${user.username}`
                                  : `ID: ${user.telegram_id}`}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <span
                          className="glass-card-badge"
                          style={{
                            fontSize: 11,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          {user.is_blocked ? (
                            <>
                              <Ban size={12} color="var(--rose)" /> Blocked
                            </>
                          ) : user.ai_mode === "draft" ? (
                            <>
                              <FileEdit size={12} color="var(--amber)" /> Draft Mode
                            </>
                          ) : user.ai_mode === "off" ? (
                            <>
                              <PauseCircle size={12} color="var(--text-2)" /> AI Off
                            </>
                          ) : (
                            <>
                              <Zap size={12} color="var(--emerald)" /> Auto
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="lifestyle-badge">
                          {user.lifestyle_summary?.length > 80
                            ? user.lifestyle_summary.slice(0, 80) + "…"
                            : user.lifestyle_summary}
                        </div>
                      </td>
                      <td className="text-sm text-muted">
                        {formatTime(user.last_active)}
                      </td>
                      <td>
                        <Link href={`/users/${user.telegram_id}`}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "6px 14px", fontSize: 12 }}
                          >
                            Open Inbox <ChevronRight size={14} />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <style>{`
              @media (min-width: 769px) {
                [data-desktop] { display: block !important; }
                [data-mobile] { display: none !important; }
              }
              @media (max-width: 768px) {
                [data-desktop] { display: none !important; }
                [data-mobile] { display: block !important; }
              }
            `}</style>

            <div data-mobile>
              {users.map((user, idx) => (
                <div key={user.telegram_id}>
                  <Link
                    href={`/users/${user.telegram_id}`}
                    className="user-mobile-card"
                  >
                    <div className="user-mobile-avatar">
                      {user.first_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-mobile-info">
                      <div className="user-mobile-name">{user.first_name}</div>
                      <div className="user-mobile-sub">
                        {user.username
                          ? `@${user.username}`
                          : `ID: ${user.telegram_id}`}
                        {user.lifestyle_summary
                          ? ` · ${user.lifestyle_summary.slice(0, 40)}…`
                          : ""}
                      </div>
                    </div>
                    <div className="user-mobile-meta">
                      {formatTimeShort(user.last_active)}
                      <div
                        className="user-mobile-chevron"
                        style={{
                          marginTop: 4,
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </Link>
                  {idx < users.length - 1 && (
                    <div className="user-mobile-separator" />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
