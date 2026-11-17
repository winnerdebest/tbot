"use client";

import { useEffect, useState } from "react";
import {
  KeyRound,
  QrCode,
  Phone,
  Terminal,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Unplug,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  fetchMe,
  fetchAvailableModels,
  saveGroqKey,
  testGroqKey,
  startTelegramQr,
  startTelegramPhone,
  verifyTelegramCode,
  verifyTelegram2FA,
  connectTelegramSessionString,
  disconnectTelegram,
  fetchTelegramStatus,
  type TenantState,
} from "@/lib/api";

export default function ConnectionsPage() {
  const [tenant, setTenant] = useState<TenantState | null>(null);
  const [models, setModels] = useState<
    { id: string; name: string; description: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Groq states
  const [groqKey, setGroqKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [savingGroq, setSavingGroq] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);

  // Telegram states
  const [tgTab, setTgTab] = useState<"qr" | "phone" | "session">("qr");
  const [apiIdInput, setApiIdInput] = useState("");
  const [apiHashInput, setApiHashInput] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [sessionStringInput, setSessionStringInput] = useState("");
  const [tgBusy, setTgBusy] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  const loadAll = async () => {
    try {
      const [meData, modelData] = await Promise.all([
        fetchMe(),
        fetchAvailableModels(),
      ]);
      setTenant(meData);
      setModels(modelData.models || []);
      setSelectedModel(meData.agent.model || "llama-3.3-70b-versatile");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to load connections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Poll QR code status if active
  useEffect(() => {
    if (!qrImage) return;
    const timer = setInterval(async () => {
      try {
        const st = await fetchTelegramStatus();
        if (st.status === "connected" || st.pending_flow?.status === "connected") {
          setQrImage(null);
          await loadAll();
          showToast("success", "Telegram account connected! 🎉");
        } else if (st.pending_flow?.status === "needs_2fa") {
          setNeeds2FA(true);
        } else if (st.pending_flow?.qr_image) {
          setQrImage(st.pending_flow.qr_image);
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [qrImage]);

  const handleSaveGroq = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGroq(true);
    try {
      await saveGroqKey(groqKey.trim(), selectedModel, Boolean(groqKey.trim()));
      setGroqKey("");
      await loadAll();
      showToast("success", "Groq API key & model saved ✓");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to save Groq API key");
    } finally {
      setSavingGroq(false);
    }
  };

  const handleTestGroq = async () => {
    setTestingGroq(true);
    try {
      const res = await testGroqKey(groqKey.trim());
      if (res.valid) {
        showToast("success", res.detail);
      } else {
        showToast("error", res.detail);
      }
    } catch (err: any) {
      showToast("error", err?.message || "Test failed");
    } finally {
      setTestingGroq(false);
    }
  };

  const parsedApiCreds = () => {
    const id = apiIdInput.trim() ? parseInt(apiIdInput.trim(), 10) : undefined;
    const hash = apiHashInput.trim() || undefined;
    return { id, hash };
  };

  const handleStartQr = async () => {
    setTgBusy(true);
    try {
      const { id, hash } = parsedApiCreds();
      const res = await startTelegramQr(id, hash);
      setQrImage(res.qr_image);
      showToast("success", "QR code ready! Scan from Telegram → Settings → Devices.");
    } catch (err: any) {
      showToast("error", err?.message || "Could not start QR login");
    } finally {
      setTgBusy(false);
    }
  };

  const handleSendPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;
    setTgBusy(true);
    try {
      const { id, hash } = parsedApiCreds();
      await startTelegramPhone(phoneInput.trim(), id, hash);
      setCodeSent(true);
      showToast("success", "Login code sent to your Telegram app!");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to send login code");
    } finally {
      setTgBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setTgBusy(true);
    try {
      const res = await verifyTelegramCode(otpCode.trim());
      if (res.status === "needs_2fa") {
        setNeeds2FA(true);
        showToast("success", "Code verified! Enter your 2FA password.");
      } else {
        setCodeSent(false);
        setOtpCode("");
        await loadAll();
        showToast("success", "Telegram connected! 🎉");
      }
    } catch (err: any) {
      showToast("error", err?.message || "Invalid verification code");
    } finally {
      setTgBusy(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaPassword) return;
    setTgBusy(true);
    try {
      await verifyTelegram2FA(twoFaPassword);
      setNeeds2FA(false);
      setTwoFaPassword("");
      await loadAll();
      showToast("success", "Telegram connected! 🎉");
    } catch (err: any) {
      showToast("error", err?.message || "Incorrect 2FA password");
    } finally {
      setTgBusy(false);
    }
  };

  const handleImportSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionStringInput.trim()) return;
    setTgBusy(true);
    try {
      const { id, hash } = parsedApiCreds();
      await connectTelegramSessionString(sessionStringInput.trim(), id, hash);
      setSessionStringInput("");
      await loadAll();
      showToast("success", "Session connected! 🎉");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to connect session");
    } finally {
      setTgBusy(false);
    }
  };

  const handleDisconnectTg = async () => {
    setTgBusy(true);
    try {
      await disconnectTelegram();
      await loadAll();
      showToast("success", "Telegram disconnected and session wiped.");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to disconnect");
    } finally {
      setTgBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="skeleton skeleton-lg" style={{ height: 320 }} />
      </div>
    );
  }

  const tgConnected = tenant?.telegram.status === "connected";

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Connections & Integrations</h1>
        <p className="page-subtitle">
          Link your personal Telegram account (no Premium required) and manage your Groq AI API key
        </p>
      </div>

      <div className="two-column" style={{ alignItems: "start" }}>
        {/* CARD 1: TELEGRAM CONNECTION */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <QrCode size={18} color="var(--emerald)" />
              Telegram Userbot Connection
            </h2>
            <span
              className="glass-card-badge"
              style={{
                color: tgConnected ? "var(--emerald)" : "var(--amber)",
                background: tgConnected ? "var(--emerald-dim)" : "var(--amber-dim)",
              }}
            >
              {tgConnected ? "Connected & Active" : "Not Connected"}
            </span>
          </div>

          {tgConnected ? (
            <div>
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <CheckCircle2 size={20} color="var(--emerald)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {tenant?.telegram.tg_first_name || "Telegram Account"}{" "}
                      {tenant?.telegram.tg_username ? `(@${tenant.telegram.tg_username})` : ""}
                    </div>
                    <div className="text-sm text-muted">
                      Telegram ID: {tenant?.telegram.tg_user_id} · Live MTProto Session
                    </div>
                  </div>
                </div>
                <p className="text-sm" style={{ color: "var(--text-1)" }}>
                  Your Telethon userbot is actively listening for incoming private messages and replying according to your persona and schedule.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDisconnectTg}
                disabled={tgBusy}
              >
                <Unplug size={15} />
                {tgBusy ? "Disconnecting..." : "Disconnect & Wipe Session"}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm" style={{ color: "var(--text-1)", marginBottom: 14 }}>
                Scan the QR code from your Telegram app (<strong>Settings → Devices → Link Desktop Device</strong>) or connect with your phone number.
              </p>

              <div className="resp-tabs" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className={tgTab === "qr" ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => {
                    setTgTab("qr");
                    if (!qrImage && !tgBusy) {
                      handleStartQr();
                    }
                  }}
                  style={{ fontSize: 12, padding: "7px 12px" }}
                >
                  <QrCode size={13} /> QR Scan
                </button>
                <button
                  type="button"
                  className={tgTab === "phone" ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => setTgTab("phone")}
                  style={{ fontSize: 12, padding: "7px 12px" }}
                >
                  <Phone size={13} /> Phone + Code
                </button>
                <button
                  type="button"
                  className={tgTab === "session" ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => setTgTab("session")}
                  style={{ fontSize: 12, padding: "7px 12px" }}
                >
                  <Terminal size={13} /> Session String
                </button>
              </div>

              {needs2FA ? (
                <form onSubmit={handleVerify2FA}>
                  <div className="form-group">
                    <label className="form-label">Telegram 2FA Password</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Enter your cloud password"
                      value={twoFaPassword}
                      onChange={(e) => setTwoFaPassword(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={tgBusy}>
                    {tgBusy ? "Verifying..." : "Verify 2FA & Connect"}
                  </button>
                </form>
              ) : tgTab === "qr" ? (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  {qrImage ? (
                    <div>
                      <img
                        src={qrImage}
                        alt="Telegram QR"
                        style={{
                          width: 210,
                          height: 210,
                          borderRadius: 12,
                          border: "4px solid white",
                          margin: "0 auto 10px",
                        }}
                      />
                      <p className="text-sm text-muted">
                        Scan via Telegram → Settings → Devices → Link Desktop Device
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleStartQr}
                      disabled={tgBusy}
                    >
                      {tgBusy ? "Generating..." : "Generate Login QR Code"}
                    </button>
                  )}
                </div>
              ) : tgTab === "phone" ? (
                !codeSent ? (
                  <form onSubmit={handleSendPhoneCode}>
                    <div className="form-group">
                      <label className="form-label">Phone Number (with +country code)</label>
                      <input
                        type="tel"
                        className="form-input"
                        placeholder="+1 555 234 5678"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={tgBusy}>
                      {tgBusy ? "Sending..." : "Send Code to Telegram"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp}>
                    <div className="form-group">
                      <label className="form-label">Verification Code from Telegram</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="12345"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="submit" className="btn btn-primary" disabled={tgBusy}>
                        {tgBusy ? "Verifying..." : "Verify & Connect"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setCodeSent(false)}
                      >
                        Back
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <form onSubmit={handleImportSession}>
                  <div className="form-group">
                    <label className="form-label">Telethon StringSession</label>
                    <textarea
                      className="form-input"
                      rows={3}
                      placeholder="Paste exported Telethon StringSession..."
                      value={sessionStringInput}
                      onChange={(e) => setSessionStringInput(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={tgBusy}>
                    {tgBusy ? "Connecting..." : "Connect Session String"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* CARD 2: GROQ BYOK KEY */}
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <KeyRound size={18} color="var(--purple)" />
              Groq AI API Key (BYOK)
            </h2>
            <span
              className="glass-card-badge"
              style={{
                color: tenant?.agent.has_groq_key ? "var(--emerald)" : "var(--rose)",
              }}
            >
              {tenant?.agent.has_groq_key
                ? `Active (${tenant.agent.groq_key_mask || "Saved"})`
                : "Missing Key"}
            </span>
          </div>

          <p className="text-sm" style={{ color: "var(--text-1)", marginBottom: 16 }}>
            Bring your own free or paid Groq API key from{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--purple)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              console.groq.com <ExternalLink size={12} />
            </a>
            . Stored encrypted with AES-256-GCM and never exposed back to the browser.
          </p>

          <form onSubmit={handleSaveGroq}>
            <div className="form-group">
              <label className="form-label">Groq API Key</label>
              <input
                type="password"
                className="form-input"
                placeholder={
                  tenant?.agent.has_groq_key
                    ? `Current key: ${tenant.agent.groq_key_mask} (paste new to update)`
                    : "gsk_..."
                }
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Groq Model</label>
              <select
                className="form-input"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ appearance: "auto" }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="resp-tabs">
              <button type="submit" className="btn btn-primary" disabled={savingGroq}>
                {savingGroq ? "Saving..." : "Save Key & Model"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTestGroq}
                disabled={testingGroq}
              >
                {testingGroq ? "Testing..." : "Test Live Key"}
              </button>
            </div>
          </form>

          <div
            style={{
              marginTop: 20,
              paddingTop: 14,
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            <ShieldCheck size={15} color="var(--emerald)" />
            <span>
              Your Groq key is only decrypted in memory when generating replies or contact summaries for your account.
            </span>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
