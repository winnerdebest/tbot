"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchHealth, updateStatus, fetchPersona, updatePersona } from "@/lib/api";
import { Wand2 } from 'lucide-react';
import Select from 'react-select';
import * as ct from 'countries-and-timezones';

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

  // ── Timezone Helpers ──
  const countryOptions = useMemo(() => {
    return Object.values(ct.getAllCountries()).map(country => ({
      value: country.id,
      label: country.name
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const selectedCountry = useMemo(() => {
    if (!persona?.timezone) return null;
    const tz = ct.getTimezone(persona.timezone);
    return tz ? countryOptions.find(c => c.value === tz.country) : null;
  }, [persona?.timezone, countryOptions]);

  const timezoneOptions = useMemo(() => {
    if (!selectedCountry) return [];
    return ct.getTimezonesForCountry(selectedCountry.value).map(tz => ({
      value: tz.name,
      label: `${tz.name} (UTC ${tz.utcOffsetStr})`
    }));
  }, [selectedCountry]);

  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: 'var(--bg-input)',
      borderColor: state.isFocused ? 'var(--border-focus)' : 'var(--border)',
      borderWidth: 0,
      borderBottom: `2px solid ${state.isFocused ? 'var(--border-focus)' : 'var(--border)'}`,
      borderRadius: 'var(--radius) var(--radius) 0 0',
      minHeight: '42px',
      boxShadow: 'none',
      "&:hover": {
        borderColor: 'var(--border-hover)'
      }
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      zIndex: 5
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isFocused ? 'var(--bg-hover)' : 'transparent',
      color: state.isSelected ? 'var(--purple)' : 'var(--text-1)',
      cursor: 'pointer',
      "&:active": {
        backgroundColor: 'var(--purple-dim)'
      }
    }),
    singleValue: (base: any) => ({
      ...base,
      color: 'var(--text-0)'
    }),
    input: (base: any) => ({
      ...base,
      color: 'var(--text-0)'
    }),
    placeholder: (base: any) => ({
      ...base,
      color: 'var(--text-3)'
    })
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
                backgroundColor: botEnabled ? 'var(--emerald)' : undefined,
                color: botEnabled ? '#131315' : undefined,
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
              <h2 className="glass-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Wand2 size={18} /> AI Persona Editor</h2>
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

              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🕒 Life Schedule & Timezone
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Select Country</label>
                    <Select
                      options={countryOptions}
                      value={selectedCountry}
                      onChange={(opt: any) => {
                        const tzs = ct.getTimezonesForCountry(opt.value);
                        if (tzs.length > 0) {
                          setPersona({ ...persona, timezone: tzs[0].name });
                        }
                      }}
                      styles={selectStyles}
                      placeholder="Search country..."
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Select Timezone</label>
                    <Select
                      options={timezoneOptions}
                      value={timezoneOptions.find(t => t.value === persona.timezone)}
                      onChange={(opt: any) => setPersona({ ...persona, timezone: opt.value })}
                      styles={selectStyles}
                      placeholder="Select timezone..."
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Sleep Starts (Hour 0-23)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={persona.sleep_schedule?.[0] || 23}
                      onChange={(e) => {
                        const newSleep = [...(persona.sleep_schedule || [23, 7])];
                        newSleep[0] = parseInt(e.target.value);
                        setPersona({ ...persona, sleep_schedule: newSleep });
                      }}
                      disabled={savingPersona}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sleep Ends (Hour 0-23)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={persona.sleep_schedule?.[1] || 7}
                      onChange={(e) => {
                        const newSleep = [...(persona.sleep_schedule || [23, 7])];
                        newSleep[1] = parseInt(e.target.value);
                        setPersona({ ...persona, sleep_schedule: newSleep });
                      }}
                      disabled={savingPersona}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Work Shifts (e.g., 9-12, 13-17)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={persona.work_schedule?.map((s: number[]) => s.join('-')).join(', ') || ""}
                    onChange={(e) => {
                      const shifts = e.target.value.split(',').map(s => s.trim().split('-').map(n => parseInt(n)));
                      setPersona({ ...persona, work_schedule: shifts.filter(s => s.length === 2 && !isNaN(s[0])) });
                    }}
                    disabled={savingPersona}
                    placeholder="9-12, 13-17"
                  />
                  <p className="text-xs text-muted" style={{ marginTop: 4 }}>Enter shifts as 'Start-End' separated by commas.</p>
                </div>
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
