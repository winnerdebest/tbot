"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/lib/api";
import { Users, ChevronRight } from 'lucide-react';

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

  const formatTimeShort = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
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
            <div className="empty-state-icon"><Users size={32} /></div>
            <p className="empty-state-text">No users yet. They&apos;ll appear once someone messages the bot.</p>
          </div>
        ) : (
          <>
            {/* Desktop: table view */}
            <div className="data-table-wrapper" style={{ display: 'none' }} data-desktop>
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
                            View Chat <ChevronRight size={14} />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Responsive: card list (desktop uses table via CSS, mobile uses cards) */}
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

            {/* Mobile: card list */}
            <div data-mobile>
              {users.map((user, idx) => (
                <div key={user.telegram_id}>
                  <Link href={`/users/${user.telegram_id}`} className="user-mobile-card">
                    <div className="user-mobile-avatar">
                      {user.first_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-mobile-info">
                      <div className="user-mobile-name">{user.first_name}</div>
                      <div className="user-mobile-sub">
                        {user.username ? `@${user.username}` : `ID: ${user.telegram_id}`}
                        {user.lifestyle_summary ? ` · ${user.lifestyle_summary.slice(0, 40)}…` : ""}
                      </div>
                    </div>
                    <div className="user-mobile-meta">
                      {formatTimeShort(user.last_active)}
                      <div className="user-mobile-chevron" style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </Link>
                  {idx < users.length - 1 && <div className="user-mobile-separator" />}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
