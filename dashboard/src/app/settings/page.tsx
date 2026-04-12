"use client";

import { useEffect, useState } from "react";
import { fetchHealth, updateStatus, fetchPersona, updatePersona } from "@/lib/api";

export default function SettingsPage() {
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [persona, setPersona] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [healthData, personaData] = await Promise.all([
          fetchHealth(),
          fetchPersona()
        ]);
        setBotEnabled(healthData.bot_enabled);
        setPersona(personaData);
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
    } catch (err) {
      showToast("error", "Failed to toggle bot");
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSavePersona = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persona) return;
    setSavingPersona(true);
    try {
      await updatePersona(persona);
      showToast("success", "Persona updated successfully");
    } catch (err) {
      showToast("error", "Failed to update persona");
    } finally {
      setSavingPersona(false);
    }
  };

  const handleTraitsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const traits = e.target.value.split('\n').filter(t => t.trim() !== '');
    setPersona({ ...persona, character_traits: traits });
  };

  const handleEmotionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const emotions = e.target.value.split('\n').filter(e => e.trim() !== '');
    setPersona({ ...persona, emotion_style: emotions });
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="page-header">
          <h1 className="page-title skeleton-text" style={{ width: 150 }}></h1>
          <p className="page-subtitle skeleton-text" style={{ width: 300, marginTop: 8 }}></p>
        </div>
        <div className="glass-card skeleton-lg" style={{ height: 200, marginBottom: 20 }} />
        <div className="glass-card skeleton-lg" style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure bot behavior and AI persona</p>
      </div>

      <div style={{ maxWidth: 800 }}>
        {/* Toggle Bot Status */}
        <div className="glass-card" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="glass-card-title">Bot Status</h2>
            <p className="text-sm text-muted" style={{ marginTop: 4 }}>Turn the Telegram bot on or off globally.</p>
          </div>
          <div>
            <button
              onClick={handleToggleBot}
              disabled={savingStatus || botEnabled === null}
              className={`btn ${botEnabled ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                width: 100,
                backgroundColor: botEnabled ? '#10b981' : undefined,
                color: botEnabled ? 'white' : undefined,
                border: botEnabled ? 'none' : undefined
              }}
            >
              {savingStatus ? "..." : botEnabled ? "Online" : "Offline"}
            </button>
          </div>
        </div>

        {/* Persona Editor */}
        {persona && (
          <div className="glass-card">
            <div className="glass-card-header">
              <h2 className="glass-card-title">🎭 AI Persona Editor</h2>
            </div>
            
            <form onSubmit={handleSavePersona}>
              <div className="form-group">
                <label className="form-label">Bot Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={persona.name}
                  onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                  disabled={savingPersona}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Base Instructions (System Prompt)</label>
                <textarea
                  className="form-input"
                  rows={8}
                  value={persona.base_instructions}
                  onChange={(e) => setPersona({ ...persona, base_instructions: e.target.value })}
                  disabled={savingPersona}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Character Traits (One per line)</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={persona.character_traits?.join('\n')}
                  onChange={handleTraitsChange}
                  disabled={savingPersona}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Emotion Style (One per line)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={persona.emotion_style?.join('\n')}
                  onChange={handleEmotionsChange}
                  disabled={savingPersona}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingPersona}
              >
                {savingPersona ? "Saving..." : "Save Persona"}
              </button>
            </form>
          </div>
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
