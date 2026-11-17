"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Send,
  Settings,
  LogOut,
  Bot,
  Plug,
  Sparkles,
  Power,
  Activity,
} from "lucide-react";
import { fetchMe, updateStatus, type TenantState } from "@/lib/api";
import AniLogo from "@/components/AniLogo";

const navItems = [
  { href: "/", icon: <LayoutDashboard size={18} />, label: "Overview" },
  { href: "/users", icon: <Users size={18} />, label: "Inbox & Contacts" },
  { href: "/connect", icon: <Plug size={18} />, label: "Connections" },
  { href: "/settings", icon: <Settings size={18} />, label: "Agent & Rules" },
  { href: "/messages", icon: <MessageSquare size={18} />, label: "Message Log" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tenant, setTenant] = useState<TenantState | null>(null);
  const [toggling, setToggling] = useState(false);

  const loadTenant = async () => {
    try {
      const data = await fetchMe();
      setTenant(data);
    } catch {
      // not logged in or loading
    }
  };

  useEffect(() => {
    if (pathname === "/login" || pathname === "/welcome") return;
    loadTenant();
  }, [pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const handleQuickToggle = async () => {
    if (!tenant || toggling) return;
    setToggling(true);
    try {
      const next = !tenant.agent.enabled;
      await updateStatus(next);
      setTenant({
        ...tenant,
        agent: { ...tenant.agent, enabled: next },
      });
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  // Don't render sidebar on login or public landing page
  if (pathname === "/login" || pathname === "/welcome") return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const tgConnected = tenant?.telegram.status === "connected";
  const groqConnected = tenant?.agent.has_groq_key;
  const aiEnabled = tenant?.agent.enabled ?? true;

  return (
    <>
      <button
        className="mobile-menu-btn"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <span className={`hamburger ${mobileOpen ? "open" : ""}`}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          {/* Logo */}
          <div className="sidebar-logo" style={{ marginBottom: 14 }}>
            <AniLogo size={34} />
            <div>
              <span className="sidebar-logo-text">Ani</span>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                Personal Telegram AI
              </div>
            </div>
            <span className="sidebar-version">v2.0</span>
          </div>

          {/* Global AI Master Kill-Switch & Connection Badges */}
          {tenant && (
            <div
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "10px 12px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: aiEnabled ? "var(--emerald)" : "var(--text-2)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: aiEnabled ? "var(--emerald)" : "var(--rose)",
                      display: "inline-block",
                    }}
                  />
                  {aiEnabled ? "AI Agent Active" : "AI Agent Paused"}
                </span>
                <button
                  onClick={handleQuickToggle}
                  disabled={toggling}
                  title="Global AI Master Switch"
                  style={{
                    background: aiEnabled
                      ? "var(--emerald-dim)"
                      : "var(--bg-hover)",
                    color: aiEnabled ? "var(--emerald)" : "var(--text-1)",
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Power size={12} />
                  {aiEnabled ? "ON" : "OFF"}
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--text-2)",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href="/connect"
                  style={{
                    padding: "2px 7px",
                    borderRadius: 6,
                    background: tgConnected
                      ? "var(--emerald-dim)"
                      : "var(--amber-dim)",
                    color: tgConnected ? "var(--emerald)" : "var(--amber)",
                    fontWeight: 500,
                  }}
                >
                  TG: {tgConnected ? `@${tenant.telegram.tg_username || "Linked"}` : "Not Linked"}
                </Link>
                <Link
                  href="/connect"
                  style={{
                    padding: "2px 7px",
                    borderRadius: 6,
                    background: groqConnected
                      ? "var(--purple-dim)"
                      : "var(--rose-dim)",
                    color: groqConnected ? "var(--purple)" : "var(--rose)",
                    fontWeight: 500,
                  }}
                >
                  Groq: {groqConnected ? "Ready" : "Add Key"}
                </Link>
              </div>
            </div>
          )}

          {/* Setup Wizard Banner if not both connected */}
          {tenant && (!tgConnected || !groqConnected) && (
            <Link
              href="/onboarding"
              onClick={() => setMobileOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                marginBottom: 10,
                borderRadius: 8,
                background: "var(--bg-2)",
                border: "1px solid var(--border-hover)",
                color: "var(--text-0)",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              <Sparkles size={14} color="var(--emerald)" />
              <span>Setup Wizard →</span>
            </Link>
          )}

          {/* Nav */}
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive(item.href) ? "active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Bottom user info + Logout */}
        <div className="sidebar-bottom">
          {tenant && (
            <div
              style={{
                padding: "6px 12px 10px",
                fontSize: 12,
                color: "var(--text-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--text-0)" }}>
                {tenant.user.name}
              </div>
              <div style={{ fontSize: 11 }}>{tenant.user.email}</div>
            </div>
          )}
          <button className="nav-link logout-btn" onClick={handleLogout}>
            <span className="nav-icon">
              <LogOut size={18} />
            </span>
            <span className="nav-label">Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
