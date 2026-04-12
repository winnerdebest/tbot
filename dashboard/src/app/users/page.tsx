"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/lib/api";

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("*")
          .order("last_active", { ascending: false });
        setUsers(data || []);
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

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

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">
          All users who have interacted with Ani — click to view their chat
        </p>
      </div>

      <div className="glass-card">
        <div className="glass-card-header">
          <h2 className="glass-card-title">User Profiles</h2>
          <span className="glass-card-badge">{users.length} total</span>
        </div>

        {loading ? (
          <div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton skeleton-text" style={{ width: `${90 - i * 8}%`, marginBottom: 16 }} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <p className="empty-state-text">No users yet. They&apos;ll appear once someone messages the bot.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Telegram ID</th>
                <th>Lifestyle Summary</th>
                <th>Last Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.telegram_id}>
                  <td>
                    <Link href={`/users/${user.telegram_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div className="user-tag">
                        <div className="user-tag-avatar">
                          {user.first_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="user-tag-name">{user.first_name}</div>
                          <div className="user-tag-username">
                            {user.username ? `@${user.username}` : "No username"}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <span className="font-mono text-sm text-muted">
                      {user.telegram_id}
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
                      <button className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }}>
                        View Chat →
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
