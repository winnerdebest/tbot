"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  QrCode,
  Phone,
  Bot,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Shield,
  Send,
  Loader2,
  Terminal,
  Zap,
  FileEdit,
  Rocket,
} from "lucide-react";
import {
  fetchMe,
  fetchAvailableModels,
  saveGroqKey,
  updatePersona,
  updateRules,
  startTelegramQr,
  startTelegramPhone,
  verifyTelegramCode,
  verifyTelegram2FA,
  connectTelegramSessionString,
  fetchTelegramStatus,
  previewAgentChat,
  markOnboardingComplete,
  type TenantState,
} from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [tenant, setTenant] = useState<TenantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Step 1 — Groq API Key & Model
  const [groqKey, setGroqKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [models, setModels] = useState<
    { id: string; name: string; description: string }[]
  >([]);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [savingGroq, setSavingGroq] = useState(false);

  // Step 2 — Telegram Connection
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

  // Step 3 — Persona & Rules
  const [selectedPreset, setSelectedPreset] = useState("casual_me");
  const [personaName, setPersonaName] = useState("Ani");
  const [personaInstructions, setPersonaInstructions] = useState("");
  const [replyMode, setReplyMode] = useState<"auto" | "draft">("auto");
  const [savingPersona, setSavingPersona] = useState(false);

  // Step 4 — Live Sandbox Preview
  const [sandboxInput, setSandboxInput] = useState("Hey! Are you free later today?");
  const [sandboxChat, setSandboxChat] = useState<
    { role: "user" | "bot"; content: string }[]
  >([]);
  const [testingChat, setTestingChat] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [meData, modelData] = await Promise.all([
          fetchMe(),
          fetchAvailableModels(),
        ]);
        setTenant(meData);
        setModels(modelData.models || []);
        setPresets(modelData.presets || {});
        setSelectedModel(meData.agent.model || "llama-3.3-70b-versatile");
        setReplyMode(meData.agent.reply_mode || "auto");
        if (meData.agent.persona) {
          setPersonaName(meData.agent.persona.name || "Ani");
          setPersonaInstructions(meData.agent.persona.base_instructions || "");
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Poll Telegram QR login status while QR is active
  useEffect(() => {
    if (!qrImage || step !== 2) return;
    const timer = setInterval(async () => {
      try {
        const st = await fetchTelegramStatus();
        if (st.status === "connected" || st.pending_flow?.status === "connected") {
          setQrImage(null);
          const refreshed = await fetchMe();
          setTenant(refreshed);
          showToast("success", "Telegram connected! 🎉");
          setStep(3);
        } else if (st.pending_flow?.status === "needs_2fa") {
          setNeeds2FA(true);
        } else if (st.pending_flow?.qr_image) {
          setQrImage(st.pending_flow.qr_image);
        }
      } catch {
        // ignore poll error
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [qrImage, step]);

  const handleSaveGroq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groqKey.trim() && !tenant?.agent.has_groq_key) {
      showToast("error", "Please paste your Groq API key");
      return;
    }
    setSavingGroq(true);
    try {
      await saveGroqKey(groqKey.trim(), selectedModel, Boolean(groqKey.trim()));
      const refreshed = await fetchMe();
      setTenant(refreshed);
      showToast("success", "Groq API key verified & encrypted ✓");
      setStep(2);
    } catch (err: any) {
      showToast("error", err?.message || "Invalid Groq API key");
    } finally {
      setSavingGroq(false);
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
      showToast("success", "Scan the QR code from your Telegram app");
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
      showToast("success", "Verification code sent to your Telegram app!");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to send verification code");
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
        showToast("success", "Code accepted! Please enter your 2FA password.");
      } else {
        const refreshed = await fetchMe();
        setTenant(refreshed);
        showToast("success", "Telegram connected! 🎉");
        setStep(3);
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
      const refreshed = await fetchMe();
      setTenant(refreshed);
      setNeeds2FA(false);
      showToast("success", "Telegram connected! 🎉");
      setStep(3);
    } catch (err: any) {
      showToast("error", err?.message || "Invalid 2FA password");
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
      const refreshed = await fetchMe();
      setTenant(refreshed);
      showToast("success", "Telegram session connected! 🎉");
      setStep(3);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to connect session string");
    } finally {
      setTgBusy(false);
    }
  };

  const handleApplyPreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const p = presets[presetKey];
    if (p) {
      setPersonaName(p.name || "Ani");
      setPersonaInstructions(p.base_instructions || "");
    }
  };

  const handleSavePersonaStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPersona(true);
    try {
      const presetObj = presets[selectedPreset] || {};
      await updatePersona({
        ...(tenant?.agent.persona || {}),
        ...presetObj,
        name: personaName,
        base_instructions: personaInstructions,
      });
      await updateRules({ reply_mode: replyMode, model: selectedModel });
      showToast("success", "Persona & reply mode saved ✓");
      setStep(4);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to save persona");
    } finally {
      setSavingPersona(false);
    }
  };

  const handleTestSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxInput.trim()) return;
    const msg = sandboxInput.trim();
    setSandboxInput("");
    const nextHist = [...sandboxChat, { role: "user" as const, content: msg }];
    setSandboxChat(nextHist);
    setTestingChat(true);

    try {
      const res = await previewAgentChat({
        message: msg,
        sender_name: "Alex",
        history: nextHist.slice(0, -1),
      });
      setSandboxChat([...nextHist, { role: "bot", content: res.reply }]);
    } catch (err: any) {
      showToast("error", err?.message || "Preview failed");
    } finally {
      setTestingChat(false);
    }
  };

  const handleFinishOnboarding = async () => {
    await markOnboardingComplete(true);
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="skeleton skeleton-lg" style={{ height: 340 }} />
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="page-header">
        <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={24} color="var(--purple)" />
          Quick Setup Wizard
        </h1>
        <p className="page-subtitle">
          Connect your Groq API key, link your Telegram account (no Premium needed), and test your AI persona
        </p>
      </div>

      {/* Step Indicator */}
      <div className="resp-grid-4" style={{ marginBottom: 24 }}>
        {[
          { n: 1, title: "1. Groq API Key" },
          { n: 2, title: "2. Connect Telegram" },
          { n: 3, title: "3. AI Persona" },
          { n: 4, title: "4. Test & Go Live" },
        ].map((item) => {
          const active = step === item.n;
          const done = step > item.n;
          return (
            <button
              key={item.n}
              type="button"
              onClick={() => setStep(item.n as any)}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: active
                  ? "1px solid var(--purple)"
                  : "1px solid var(--border)",
                background: active
                  ? "var(--purple-dim)"
                  : done
                  ? "var(--emerald-dim)"
                  : "var(--bg-1)",
                color: active
                  ? "var(--purple)"
                  : done
                  ? "var(--emerald)"
                  : "var(--text-1)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{item.title}</span>
              {done && <CheckCircle2 size={15} />}
            </button>
          );
        })}
      </div>

      {/* STEP 1: GROQ KEY */}
      {step === 1 && (
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <KeyRound size={18} color="var(--purple)" />
              Step 1: Connect Your Groq API Key (BYOK)
            </h2>
            {tenant?.agent.has_groq_key && (
              <span className="glass-card-badge" style={{ color: "var(--emerald)" }}>
                Connected ({tenant.agent.groq_key_mask})
              </span>
            )}
          </div>

          <p className="text-sm" style={{ color: "var(--text-1)", marginBottom: 18 }}>
            Ani uses Groq for instant AI replies and background contact memory summarization. Get a free API key from{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--purple)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              console.groq.com/keys <ExternalLink size={12} />
            </a>
            . Your key is encrypted with AES-256-GCM.
          </p>

          <form onSubmit={handleSaveGroq}>
            <div className="form-group">
              <label className="form-label">Groq API Key</label>
              <input
                type="password"
                className="form-input"
                placeholder={
                  tenant?.agent.has_groq_key
                    ? `Saved (${tenant.agent.groq_key_mask}) — paste new key to replace`
                    : "gsk_..."
                }
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">AI Model</label>
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

            <div className="resp-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(2)}
              >
                Skip for now →
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingGroq}>
                {savingGroq ? "Verifying with Groq..." : "Verify & Continue →"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: TELEGRAM CONNECTION */}
      {step === 2 && (
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <QrCode size={18} color="var(--emerald)" />
              Step 2: Link Your Personal Telegram Account
            </h2>
            {tenant?.telegram.status === "connected" && (
              <span className="glass-card-badge" style={{ color: "var(--emerald)" }}>
                Connected (@{tenant.telegram.tg_username || tenant.telegram.tg_first_name})
              </span>
            )}
          </div>

          <p className="text-sm" style={{ color: "var(--text-1)", marginBottom: 16 }}>
            Scan the QR code from your Telegram app (<strong>Settings → Devices → Link Desktop Device</strong>) or sign in with your phone number.
          </p>

          {/* Method Tabs */}
          <div className="resp-tabs" style={{ marginBottom: 18 }}>
            <button
              type="button"
              className={tgTab === "qr" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => {
                setTgTab("qr");
                if (!qrImage && !tgBusy) {
                  handleStartQr();
                }
              }}
              style={{ fontSize: 13, padding: "8px 14px" }}
            >
              <QrCode size={14} /> QR Code Scan
            </button>
            <button
              type="button"
              className={tgTab === "phone" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => setTgTab("phone")}
              style={{ fontSize: 13, padding: "8px 14px" }}
            >
              <Phone size={14} /> Phone + OTP Code
            </button>
            <button
              type="button"
              className={tgTab === "session" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => setTgTab("session")}
              style={{ fontSize: 13, padding: "8px 14px" }}
            >
              <Terminal size={14} /> Session String
            </button>
          </div>

          {needs2FA ? (
            <form onSubmit={handleVerify2FA} style={{ marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">Telegram 2FA Cloud Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter your Telegram Two-Step Verification password"
                  value={twoFaPassword}
                  onChange={(e) => setTwoFaPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={tgBusy}>
                {tgBusy ? "Verifying..." : "Unlock & Connect Telegram"}
              </button>
            </form>
          ) : tgTab === "qr" ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              {qrImage ? (
                <div>
                  <img
                    src={qrImage}
                    alt="Telegram Login QR"
                    style={{
                      width: 220,
                      height: 220,
                      borderRadius: 12,
                      border: "4px solid white",
                      margin: "0 auto 12px",
                    }}
                  />
                  <p className="text-sm" style={{ color: "var(--text-1)" }}>
                    Open Telegram on your phone → <strong>Settings → Devices → Link Desktop Device</strong> and scan this QR code.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartQr}
                  disabled={tgBusy}
                >
                  {tgBusy ? "Generating QR..." : "Generate Telegram Login QR Code"}
                </button>
              )}
            </div>
          ) : tgTab === "phone" ? (
            <div>
              {!codeSent ? (
                <form onSubmit={handleSendPhoneCode}>
                  <div className="form-group">
                    <label className="form-label">Phone Number (with country code)</label>
                    <input
                      type="tel"
                      className="form-input"
                      placeholder="+1 555 123 4567"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={tgBusy}>
                    {tgBusy ? "Sending Code..." : "Send Login Code to Telegram"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp}>
                  <div className="form-group">
                    <label className="form-label">5-Digit Code sent to your Telegram app</label>
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
                      {tgBusy ? "Verifying..." : "Verify Code & Connect"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCodeSent(false)}
                    >
                      Change Phone
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <form onSubmit={handleImportSession}>
              <div className="form-group">
                <label className="form-label">Telethon StringSession</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Paste an exported Telethon StringSession..."
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

          <div className="resp-actions" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(3)}>
              {tenant?.telegram.status === "connected" ? "Next: Configure Persona →" : "Skip Telegram for now →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PERSONA & REPLY MODE */}
      {step === 3 && (
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title">Step 3: Choose Your AI Persona & Reply Mode</h2>
          </div>

          <form onSubmit={handleSavePersonaStep}>
            <div className="form-group">
              <label className="form-label">Starter Persona Presets</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                {Object.entries(presets).map(([key, p]: [string, any]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleApplyPreset(key)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border:
                        selectedPreset === key
                          ? "1px solid var(--purple)"
                          : "1px solid var(--border)",
                      background:
                        selectedPreset === key ? "var(--purple-dim)" : "var(--bg-2)",
                      textAlign: "left",
                      cursor: "pointer",
                      color: "var(--text-0)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4 }}>
                      {(p.character_traits || []).slice(0, 2).join(" · ")}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Your Display Name (how the AI refers to itself)</label>
              <input
                type="text"
                className="form-input"
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Base Persona Instructions</label>
              <textarea
                className="form-input"
                rows={5}
                value={personaInstructions}
                onChange={(e) => setPersonaInstructions(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Reply Mode</label>
              <div className="resp-grid-2">
                <button
                  type="button"
                  onClick={() => setReplyMode("auto")}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border:
                      replyMode === "auto"
                        ? "1px solid var(--emerald)"
                        : "1px solid var(--border)",
                    background:
                      replyMode === "auto" ? "var(--emerald-dim)" : "var(--bg-2)",
                    color: "var(--text-0)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <Zap size={14} color="var(--emerald)" /> Auto-Reply Mode
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                    AI replies automatically with human typing simulation; auto-pauses when you text manually.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setReplyMode("draft")}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border:
                      replyMode === "draft"
                        ? "1px solid var(--amber)"
                        : "1px solid var(--border)",
                    background:
                      replyMode === "draft" ? "var(--amber-dim)" : "var(--bg-2)",
                    color: "var(--text-0)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <FileEdit size={14} color="var(--amber)" /> Draft Approval Mode
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                    AI drafts replies in your Inbox for 1-click approval or editing before sending.
                  </div>
                </button>
              </div>
            </div>

            <div className="resp-actions" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                ← Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingPersona}>
                {savingPersona ? "Saving..." : "Save & Test in Live Sandbox →"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 4: LIVE SANDBOX & FINISH */}
      {step === 4 && (
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title">Step 4: Test Your AI Agent Live</h2>
            <span className="glass-card-badge">Sandbox Preview</span>
          </div>

          <p className="text-sm" style={{ color: "var(--text-1)", marginBottom: 14 }}>
            Send a test message below to see how <strong>{personaName}</strong> responds using your Groq API key and persona settings.
          </p>

          <div
            style={{
              background: "var(--bg-0)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              minHeight: 200,
              maxHeight: 320,
              overflowY: "auto",
              marginBottom: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {sandboxChat.length === 0 ? (
              <div className="text-sm text-muted" style={{ margin: "auto", textAlign: "center" }}>
                Send a message below to test your AI clone!
              </div>
            ) : (
              sandboxChat.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.role === "bot" ? "flex-end" : "flex-start",
                    background:
                      m.role === "bot"
                        ? "var(--primary-container)"
                        : "var(--bg-2)",
                    color: "#fff",
                    padding: "9px 14px",
                    borderRadius: 12,
                    maxWidth: "78%",
                    fontSize: 13.5,
                  }}
                >
                  <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 2 }}>
                    {m.role === "bot" ? `${personaName} (AI)` : "Alex (Contact)"}
                  </div>
                  {m.content}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleTestSandbox} style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Write a message as a friend..."
              value={sandboxInput}
              onChange={(e) => setSandboxInput(e.target.value)}
              disabled={testingChat}
            />
            <button type="submit" className="btn btn-secondary" disabled={testingChat}>
              {testingChat ? "..." : <><Send size={14} /> Test Reply</>}
            </button>
          </form>

          <div className="resp-actions" style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(3)}>
              ← Back
            </button>
            <button type="button" className="btn btn-primary" onClick={handleFinishOnboarding}>
              <Rocket size={15} /> Launch Dashboard & Inbox
            </button>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
