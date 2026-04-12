"use client";

import { useEffect, useState } from "react";
import { fetchStats, type Stats } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { MessageLog, UserProfile } from "@/lib/api";
import { Users, MessageSquare, Activity, Bot, User } from 'lucide-react';

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentMessages, setRecentMessages] = useState<MessageLog[]>([]);
  const [recentUsers, setRecentUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch stats from FastAPI
        const statsData = await fetchStats();
        setStats(statsData);

        // Fetch recent messages from Supabase
        const { data: messages } = await supabase
          .from("message_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(8);
        setRecentMessages(messages || []);

        // Fetch recent active users
        const { data: users } = await supabase
          .from("user_profiles")
          .select("*")
          .order("last_active", { ascending: false })
          .limit(5);
        setRecentUsers(users || []);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Real-time overview of your Telegram AI assistant
        </p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card purple">
          <div className="stat-card-header">
            <div className="stat-card-icon purple"><Users size={20} /></div>
            <span className="stat-card-label">Total Users</span>
          </div>
          {loading ? (
            <div className="skeleton skeleton-lg" />
          ) : (
            <div className="stat-card-value">{stats?.total_users ?? 0}</div>
          )}
        </div>

        <div className="stat-card blue">
          <div className="stat-card-header">
            <div className="stat-card-icon blue"><MessageSquare size={20} /></div>
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
            <div className="stat-card-icon emerald"><Activity size={20} /></div>
            <span className="stat-card-label">Active Today</span>
          </div>
          {loading ? (
            <div className="skeleton skeleton-lg" />
          ) : (
            <div className="stat-card-value">{recentUsers.length}</div>
          )}
        </div>

        <div className="stat-card amber">
          <div className="stat-card-header">
            <div className="stat-card-icon amber"><Bot size={20} /></div>
            <span className="stat-card-label">Bot Responses</span>
          </div>
          {loading ? (
            <div className="skeleton skeleton-lg" />
          ) : (
            <div className="stat-card-value">
              {recentMessages.filter((m) => m.role === "bot").length}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="two-column">
        {/* Recent Messages */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title">Recent Messages</h2>
            <span className="glass-card-badge">Live</span>
          </div>
          {loading ? (
            <div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton skeleton-text" style={{ width: `${80 - i * 10}%`, marginBottom: 12 }} />
              ))}
            </div>
          ) : recentMessages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><MessageSquare size={32} /></div>
              <p className="empty-state-text">No messages yet. Start a conversation with the bot!</p>
            </div>
          ) : (
            <div className="message-list">
              {recentMessages.slice(0, 5).map((msg) => (
                <div key={msg.id} className="message-bubble">
                  <div className={`message-avatar ${msg.role === "bot" ? "bot-avatar" : "user-avatar"}`}>
                    {msg.role === "bot" ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div className="message-content">
                    <div className="message-meta">
                      <span className={`message-role ${msg.role === "bot" ? "bot-role" : "user-role"}`}>
                        {msg.role === "bot" ? "Ani" : `User`}
                      </span>
                      <span className="message-time">{formatTime(msg.created_at)}</span>
                    </div>
                    <p className="message-text">
                      {msg.content.length > 120 ? msg.content.slice(0, 120) + "…" : msg.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Users */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title">Recent Users</h2>
            <span className="glass-card-badge">{recentUsers.length} active</span>
          </div>
          {loading ? (
            <div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton skeleton-text" style={{ width: `${90 - i * 15}%`, marginBottom: 12 }} />
              ))}
            </div>
          ) : recentUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Users size={32} /></div>
              <p className="empty-state-text">No users yet. They&apos;ll appear once someone messages the bot.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((user) => (
                  <tr key={user.telegram_id}>
                    <td>
                      <div className="user-tag">
                        <div className="user-tag-avatar">
                          {user.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="user-tag-name">{user.first_name}</div>
                          <div className="user-tag-username">
                            {user.username ? `@${user.username}` : `ID: ${user.telegram_id}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-muted">{formatTime(user.last_active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
