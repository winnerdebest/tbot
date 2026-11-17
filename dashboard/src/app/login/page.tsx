"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  QrCode,
  KeyRound,
  Brain,
  ArrowRight,
} from "lucide-react";
import AniLogo from "@/components/AniLogo";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const errParam = params.get("error");
      if (errParam) {
        setError(errParam);
      }
    }
  }, []);

  const handleGoogleSignIn = () => {
    setError("");
    setRedirecting(true);
    window.location.href = "/api/auth/google";
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-0)",
        overflowY: "auto",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
      }}
    >
      <div className="resp-split-hero">
        {/* Left column — Value Prop & Features */}
        <div style={{ padding: "8px 4px" }}>
          <Link
            href="/welcome"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--text-2)",
              marginBottom: 16,
            }}
          >
            ← Back to Landing Page
          </Link>

          <h1
            style={{
              fontSize: "clamp(26px, 5vw, 36px)",
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              marginBottom: 14,
            }}
          >
            Your Personal AI Agent for{" "}
            <span style={{ color: "var(--purple)" }}>Telegram</span>.
          </h1>

          <p
            style={{
              fontSize: 15,
              color: "var(--text-1)",
              lineHeight: 1.65,
              marginBottom: 28,
            }}
          >
            Sign in with Google, connect your Telegram account in 30 seconds,
            paste your Groq API key, and customize how your AI clone replies,
            remembers contacts, and respects your sleep & work schedule.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--purple)",
                  flexShrink: 0,
                }}
              >
                <QrCode size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  1. Connect Any Telegram Account
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                  Link via QR code or phone verification code directly from your
                  browser.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--emerald)",
                  flexShrink: 0,
                }}
              >
                <KeyRound size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  2. Bring Your Own Groq Key (Encrypted)
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                  Paste your Groq API key for fast Llama 3.3 70B replies.
                  Encrypted at rest with AES-256-GCM.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--amber)",
                  flexShrink: 0,
                }}
              >
                <Brain size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  3. Two-Tier Memory, Draft Mode & Auto-Pause
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                  Remembers facts about every contact, pauses automatically when
                  you text manually, and supports 1-click Draft approval.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Google OAuth Card */}
        <div
          className="login-card resp-split-auth-card"
          style={{
            maxWidth: 420,
            width: "100%",
            margin: "0 auto",
            padding: "32px 24px",
          }}
        >
          <div className="login-header" style={{ marginBottom: 26 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <AniLogo size={48} />
            </div>
            <h2 className="login-title" style={{ fontSize: 23 }}>
              Welcome to Ani
            </h2>
            <p className="login-subtitle">
              Continue with your Google account to access your AI agent & inbox
            </p>
          </div>

          {error && (
            <div className="login-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={redirecting}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "13px 20px",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "#f4f4f6",
              color: "#09090b",
              fontSize: 14.5,
              fontWeight: 600,
              cursor: redirecting ? "wait" : "pointer",
              transition: "transform 0.15s ease, background 0.15s ease",
            }}
          >
            {/* Official 4-color Google 'G' SVG */}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
              />
            </svg>
            <span>
              {redirecting
                ? "Redirecting to Google..."
                : "Continue with Google"}
            </span>
          </button>

          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            <ShieldCheck size={14} color="var(--emerald)" />
            <span>Zero passwords stored · AES-256-GCM encrypted vault</span>
          </div>
        </div>
      </div>
    </div>
  );
}
