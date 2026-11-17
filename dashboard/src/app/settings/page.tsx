"use client";

import { useEffect, useState, useMemo } from "react";
import {
  fetchHealth,
  updateStatus,
  fetchPersona,
  updatePersona,
  fetchRules,
  updateRules,
  fetchAvailableModels,
  previewAgentChat,
} from "@/lib/api";
import {
  Activity,
  Bot,
  Clock,
  Shield,
  Sliders,
  Sparkles,
  Send,
} from "lucide-react";
import Select from "react-select";
import * as ct from "countries-and-timezones";

export default function SettingsPage() {
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [persona, setPersona] = useState<any>(null);
  const [rules, setRules] = useState<any>(null);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Raw textarea states
  const [traitsInput, setTraitsInput] = useState("");
  const [emotionsInput, setEmotionsInput] = useState("");
  const [workShiftsInput, setWorkShiftsInput] = useState("");
  const [handoffInput, setHandoffInput] = useState("");

  // Live Sandbox Preview states
  const [sandboxMsg, setSandboxMsg] = useState("Hey! What are you up to right now?");
  const [sandboxHistory, setSandboxHistory] = useState<
    { role: "user" | "bot"; content: string }[]
  >([]);
  const [testingPreview, setTestingPreview] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [healthData, personaData, rulesData, modelData] = await Promise.all([
          fetchHealth(),
          fetchPersona(),
          fetchRules(),
          fetchAvailableModels(),
        ]);
        setBotEnabled(healthData.bot_enabled);
        setPersona(personaData);
        setRules(rulesData);
        setPresets(modelData.presets || {});
        setModels(modelData.models || []);

        if (personaData.character_traits) {
          setTraitsInput(personaData.character_traits.join("\n"));
        }
        if (personaData.emotion_style) {
          setEmotionsInput(personaData.emotion_style.join("\n"));
        }
        if (personaData.work_schedule) {
          setWorkShiftsInput(
            personaData.work_schedule.map((s: number[]) => s.join("-")).join(", ")
          );
        }
        if (rulesData.handoff_keywords) {
          setHandoffInput(rulesData.handoff_keywords.join(", "));
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        showToast("error", "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleToggleBot = async () => {
    if (botEnabled === null) return;
    setSavingStatus(true);
    try {
      const result = await updateStatus(!botEnabled);
      setBotEnabled(result.bot_enabled);
      showToast("success", `Bot turned ${result.bot_enabled ? "On" : "Off"}`);
    } catch {
      showToast("error", "Failed to toggle bot");
    } finally {
      setSavingStatus(false);
    }
  };

  const applyPreset = (presetKey: string) => {
    const p = presets[presetKey];
    if (!p || !persona) return;
    const next = {
      ...persona,
      ...p,
    };
    setPersona(next);
    setTraitsInput((next.character_traits || []).join("\n"));
    setEmotionsInput((next.emotion_style || []).join("\n"));
    showToast("success", `Loaded "${p.label}" preset`);
  };

  const buildPersonaPayload = () => {
    const character_traits = traitsInput
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t !== "");

    const emotion_style = emotionsInput
      .split("\n")
      .map((e) => e.trim())
      .filter((e) => e !== "");

    const work_schedule = workShiftsInput
      .split(",")
      .map((s) => s.trim().split("-").map((n) => parseInt(n.trim(), 10)))
      .filter((s) => s.length === 2 && !isNaN(s[0]) && !isNaN(s[1]));

    return {
      ...persona,
      character_traits,
      emotion_style,
      work_schedule,
    };
  };

  const handleSavePersona = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persona) return;
    setSavingPersona(true);
    try {
      const payload = buildPersonaPayload();
      await updatePersona(payload);
      setPersona(payload);
      showToast("success", "Persona & Schedule saved ✓");
    } catch {
      showToast("error", "Failed to update persona");
    } finally {
      setSavingPersona(false);
    }
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rules) return;
    setSavingRules(true);
    try {
      const handoff_keywords = handoffInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const updated = await updateRules({
        model: rules.model,
        reply_mode: rules.reply_mode,
        audience: rules.audience,
        pause_minutes_after_manual: Number(rules.pause_minutes_after_manual),
        batch_seconds: Number(rules.batch_seconds),
        respond_in_groups: Boolean(rules.respond_in_groups),
        handoff_keywords,
      });
      setRules({ ...rules, ...updated });
      showToast("success", "Automation & Safety Rules saved ✓");
    } catch {
      showToast("error", "Failed to save rules");
    } finally {
      setSavingRules(false);
    }
  };

  const handlePreviewSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxMsg.trim()) return;
    const text = sandboxMsg.trim();
    setSandboxMsg("");
    const nextHist = [...sandboxHistory, { role: "user" as const, content: text }];
    setSandboxHistory(nextHist);
    setTestingPreview(true);
    try {
      const res = await previewAgentChat({
        message: text,
        sender_name: "Alex",
        history: nextHist.slice(0, -1),
        persona_override: buildPersonaPayload(),
      });
      setSandboxHistory([...nextHist, { role: "bot", content: res.reply }]);
    } catch (err: any) {
      showToast("error", err?.message || "Preview failed — check your Groq key");
    } finally {
      setTestingPreview(false);
    }
  };

  // Timezone Helpers
  const countryOptions = useMemo(() => {
    const countries = ct.getAllCountries();
    return Object.values(countries)
      .map((c) => ({ value: c.id, label: c.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const selectedCountry = useMemo(() => {
    if (!persona?.timezone) return null;
    const tz = ct.getTimezone(persona.timezone);
    if (!tz || !tz.countries.length) return null;
    const countryId = tz.countries[0];
    return countryOptions.find((c) => c.value === countryId) || null;
  }, [persona?.timezone, countryOptions]);

  const timezoneOptions = useMemo(() => {
    if (!selectedCountry) return [];
    const tzs = ct.getTimezonesForCountry(selectedCountry.value) || [];
    return tzs.map((tz) => ({
      value: tz.name,
      label: `${tz.name.split("/").pop()?.replace(/_/g, " ")} (${tz.utcOffsetStr})`,
    }));
  }, [selectedCountry]);

  const customSelectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      background: "var(--bg-input)",
      borderColor: state.isFocused ? "var(--border-focus)" : "var(--border)",
      borderRadius: "var(--radius)",
      padding: "2px 4px",
      color: "var(--text-0)",
      boxShadow: "none",
    }),
    menu: (base: any) => ({
      ...base,
      background: "var(--bg-2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      zIndex: 100,
    }),
    option: (base: any, state: any) => ({
      ...base,
      background: state.isSelected
        ? "var(--primary-container)"
        : state.isFocused
        ? "var(--bg-hover)"
        : "transparent",
      color: "var(--text-0)",
      cursor: "pointer",
      fontSize: "14px",
    }),
    singleValue: (base: any) => ({
      ...base,
      color: "var(--text-0)",
      fontSize: "14px",
    }),
    input: (base: any) => ({
      ...base,
      color: "var(--text-0)",
    }),
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Agent Persona, Rules & Live Sandbox</h1>
        <p className="page-subtitle">
          Customize your AI personality, automation rules, schedule, and test replies in real time
        </p>
      </div>

      {loading ? (
        <div className="glass-card">
          <div className="skeleton skeleton-lg" style={{ height: 320 }} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Compact Top Bar: Global Agent Status */}
          <div
            className="glass-card"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
              padding: "16px 22px",
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <Activity size={17} color={botEnabled ? "var(--emerald)" : "var(--text-2)"} />
                <h2 className="glass-card-title">Global Agent Status</h2>
                <span
                  className="glass-card-badge"
                  style={{
                    color: botEnabled ? "var(--emerald)" : "var(--text-2)",
                    borderColor: botEnabled ? "rgba(52, 211, 153, 0.3)" : "var(--border)",
                  }}
                >
                  {botEnabled ? "Active" : "Paused"}
                </span>
              </div>
              <p className="text-sm text-muted">
                When enabled, your AI agent automatically handles incoming Telegram messages according to your reply mode and schedule.
              </p>
            </div>

            <button
              className={`btn ${botEnabled ? "btn-secondary" : "btn-primary"}`}
              onClick={handleToggleBot}
              disabled={savingStatus}
            >
              {savingStatus
                ? "Updating..."
                : botEnabled
                ? "Pause AI Agent"
                : "Enable AI Agent"}
            </button>
          </div>

          {/* Main 2-Column Workspace: Left = Persona & Schedule, Right = Rules + Live Sandbox stacked flush */}
          <div className="two-column" style={{ alignItems: "start" }}>
            {persona && (
              <div className="glass-card">
                <div className="glass-card-header">
                  <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Bot size={18} color="var(--purple)" />
                    AI Persona & Schedule
                  </h2>
                </div>

                {/* Preset Quick-Load Buttons */}
                {Object.keys(presets).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="form-label" style={{ marginBottom: 6 }}>
                      Load Starter Preset
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Object.entries(presets).map(([k, p]: [string, any]) => (
                        <button
                          key={k}
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => applyPreset(k)}
                          style={{ fontSize: 12, padding: "6px 12px" }}
                        >
                          <Sparkles size={12} /> {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSavePersona}>
                  <div className="form-group">
                    <label className="form-label">Persona Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={persona.name || ""}
                      onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                      required
                    />
                  </div>

                  {/* Style Sliders / Selectors */}
                  <div className="resp-grid-3">
                    <div className="form-group">
                      <label className="form-label">Reply Length</label>
                      <select
                        className="form-input"
                        value={persona.style_length || "short"}
                        onChange={(e) =>
                          setPersona({ ...persona, style_length: e.target.value })
                        }
                        style={{ appearance: "auto" }}
                      >
                        <option value="short">Short (1-2 lines)</option>
                        <option value="medium">Medium</option>
                        <option value="long">Detailed</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Emoji Style</label>
                      <select
                        className="form-input"
                        value={persona.style_emoji || "minimal"}
                        onChange={(e) =>
                          setPersona({ ...persona, style_emoji: e.target.value })
                        }
                        style={{ appearance: "auto" }}
                      >
                        <option value="none">No Emojis</option>
                        <option value="minimal">Minimal</option>
                        <option value="expressive">Expressive</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Formality</label>
                      <select
                        className="form-input"
                        value={persona.style_formality || "casual"}
                        onChange={(e) =>
                          setPersona({ ...persona, style_formality: e.target.value })
                        }
                        style={{ appearance: "auto" }}
                      >
                        <option value="casual">Casual Texting</option>
                        <option value="balanced">Balanced</option>
                        <option value="professional">Professional</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Base Instructions</label>
                    <textarea
                      className="form-input"
                      rows={5}
                      value={persona.base_instructions || ""}
                      onChange={(e) =>
                        setPersona({ ...persona, base_instructions: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Character Traits (One per line)</label>
                    <textarea
                      className="form-input"
                      rows={4}
                      value={traitsInput}
                      onChange={(e) => setTraitsInput(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Emotion Style (One per line)</label>
                    <textarea
                      className="form-input"
                      rows={3}
                      value={emotionsInput}
                      onChange={(e) => setEmotionsInput(e.target.value)}
                    />
                  </div>

                  {/* Schedule Section */}
                  <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                    <h3 className="glass-card-title" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <Clock size={16} />
                      Life Schedule & Timezone (Busy-Hour Queueing)
                    </h3>

                    <div className="resp-grid-2" style={{ marginBottom: 14 }}>
                      <div className="form-group">
                        <label className="form-label">Country</label>
                        <Select
                          options={countryOptions}
                          value={selectedCountry}
                          onChange={(opt: any) => {
                            if (!opt) return;
                            const tzs = ct.getTimezonesForCountry(opt.value);
                            if (tzs && tzs.length > 0) {
                              setPersona({ ...persona, timezone: tzs[0].name });
                            }
                          }}
                          styles={customSelectStyles}
                          placeholder="Search country..."
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Timezone</label>
                        <Select
                          options={timezoneOptions}
                          value={timezoneOptions.find((t) => t.value === persona.timezone)}
                          onChange={(opt: any) =>
                            opt && setPersona({ ...persona, timezone: opt.value })
                          }
                          styles={customSelectStyles}
                          placeholder="Select timezone..."
                          isDisabled={!selectedCountry}
                        />
                      </div>
                    </div>

                    <div className="resp-grid-2" style={{ marginBottom: 14 }}>
                      <div className="form-group">
                        <label className="form-label">Sleep Start Hour (0-23)</label>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          className="form-input"
                          value={persona.sleep_schedule?.[0] ?? 23}
                          onChange={(e) => {
                            const next = [...(persona.sleep_schedule || [23, 7])];
                            next[0] = parseInt(e.target.value, 10) || 0;
                            setPersona({ ...persona, sleep_schedule: next });
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Wake Up Hour (0-23)</label>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          className="form-input"
                          value={persona.sleep_schedule?.[1] ?? 7}
                          onChange={(e) => {
                            const next = [...(persona.sleep_schedule || [23, 7])];
                            next[1] = parseInt(e.target.value, 10) || 0;
                            setPersona({ ...persona, sleep_schedule: next });
                          }}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Work Shifts (24h, e.g. 9-12, 14-18)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={workShiftsInput}
                        onChange={(e) => setWorkShiftsInput(e.target.value)}
                        placeholder="9-17"
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={savingPersona}>
                    {savingPersona ? "Saving..." : "Save Persona & Schedule"}
                  </button>
                </form>
              </div>
            )}

            {/* Right Column: Automation Rules + Live Sandbox stacked flush with zero gap */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {rules && (
                <div className="glass-card">
                  <div className="glass-card-header">
                    <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Shield size={18} color="var(--emerald)" />
                      Automation & Safety Rules
                    </h2>
                  </div>

                  <form onSubmit={handleSaveRules}>
                    <div className="resp-grid-2">
                      <div className="form-group">
                        <label className="form-label">Default Reply Mode</label>
                        <select
                          className="form-input"
                          value={rules.reply_mode}
                          onChange={(e) => setRules({ ...rules, reply_mode: e.target.value })}
                          style={{ appearance: "auto" }}
                        >
                          <option value="auto">Auto-Reply (Instant)</option>
                          <option value="draft">Draft for Approval</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Who to Reply To</label>
                        <select
                          className="form-input"
                          value={rules.audience}
                          onChange={(e) => setRules({ ...rules, audience: e.target.value })}
                          style={{ appearance: "auto" }}
                        >
                          <option value="everyone">Everyone (except blocked)</option>
                          <option value="allowlist">Allowlisted Contacts Only</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Auto-Pause After You Text (mins)</label>
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          className="form-input"
                          value={rules.pause_minutes_after_manual}
                          onChange={(e) =>
                            setRules({ ...rules, pause_minutes_after_manual: e.target.value })
                          }
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Burst Batching Window (secs)</label>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          className="form-input"
                          value={rules.batch_seconds}
                          onChange={(e) =>
                            setRules({ ...rules, batch_seconds: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Handoff Keywords (auto-pauses AI when contact says these)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="urgent, call me, emergency"
                        value={handoffInput}
                        onChange={(e) => setHandoffInput(e.target.value)}
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={savingRules}>
                      {savingRules ? "Saving Rules..." : "Save Automation Rules"}
                    </button>
                  </form>
                </div>
              )}

              {/* Live Sandbox Preview Chat */}
              <div className="glass-card">
              <div className="glass-card-header">
                <h2 className="glass-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={18} color="var(--amber)" />
                  Live Persona Test Sandbox
                </h2>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                  onClick={() => setSandboxHistory([])}
                >
                  Clear Chat
                </button>
              </div>
              <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
                Test how your unsaved or saved persona responds right now using your Groq API key.
              </p>

              <div
                style={{
                  background: "var(--bg-0)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                  minHeight: 280,
                  maxHeight: 400,
                  overflowY: "auto",
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {sandboxHistory.length === 0 ? (
                  <div className="text-sm text-muted" style={{ margin: "auto", textAlign: "center" }}>
                    Send a message below to preview your AI agent&apos;s tone and style.
                  </div>
                ) : (
                  sandboxHistory.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: m.role === "bot" ? "flex-end" : "flex-start",
                        background:
                          m.role === "bot"
                            ? "var(--primary-container)"
                            : "var(--bg-2)",
                        color: "#fff",
                        padding: "9px 14px",
                        borderRadius: 12,
                        maxWidth: "82%",
                        fontSize: 13.5,
                      }}
                    >
                      <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 2 }}>
                        {m.role === "bot" ? `${persona?.name || "Ani"} (AI)` : "Alex (Contact)"}
                      </div>
                      {m.content}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handlePreviewSend} style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type a message to test your AI..."
                  value={sandboxMsg}
                  onChange={(e) => setSandboxMsg(e.target.value)}
                  disabled={testingPreview}
                />
                <button type="submit" className="btn btn-primary" disabled={testingPreview}>
                  {testingPreview ? "..." : <><Send size={14} /> Send</>}
                </button>
              </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
