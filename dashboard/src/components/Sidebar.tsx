"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { LayoutDashboard, Users, MessageSquare, Send, Settings, LogOut, Bot } from 'lucide-react';

const navItems = [
  { href: "/", icon: <LayoutDashboard size={18} />, label: "Overview" },
  { href: "/users", icon: <Users size={18} />, label: "Users" },
  { href: "/messages", icon: <MessageSquare size={18} />, label: "Messages" },
  { href: "/send", icon: <Send size={18} />, label: "Send" },
  { href: "/settings", icon: <Settings size={18} />, label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  // Don't render sidebar on login page
  if (pathname === "/login") return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile hamburger — opens full sidebar drawer */}
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

      {/* Overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Desktop / Drawer Sidebar */}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          {/* Logo */}
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon"><Bot size={20} color="white" /></div>
            <span className="sidebar-logo-text">Ani</span>
            <span className="sidebar-version">v2</span>
          </div>

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

        {/* Bottom */}
        <div className="sidebar-bottom">
          <button className="nav-link logout-btn" onClick={handleLogout}>
            <span className="nav-icon"><LogOut size={18} /></span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Bottom Navigation Bar ── */}
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item ${isActive(item.href) ? "active" : ""}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
