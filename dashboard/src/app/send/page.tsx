"use client";

import { useState } from "react";
import { sendManualMessage } from "@/lib/api";
import { Send, Info } from 'lucide-react';

export default function SendPage() {
  const [telegramId, setTelegramId] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!telegramId.trim() || !text.trim()) {
      showToast("error", "Please fill in both fields");
      return;
    }

    const id = parseInt(telegramId.trim());
    if (isNaN(id)) {
      showToast("error", "Telegram ID must be a number");
      return;
    }

    setSending(true);
    try {
      const result = await sendManualMessage({ telegram_id: id, text: text.trim() });
      if (result.status === "sent") {
        showToast("success", `Message sent to ${id} ✓`);
        setText("");
      } else {
        showToast("error", result.detail || "Failed to send message");
      }
    } catch (err) {
      showToast("error", "Connection failed — is the bot running?");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Send Message</h1>
        <p className="page-subtitle">
          Send a message to any Telegram user through the bot
        </p>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="glass-card">
          <div className="glass-card-header">
            <h2 className="glass-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Send size={18} /> Manual Message</h2>
          </div>

          <form onSubmit={handleSend}>
            <div className="form-group">
              <label htmlFor="telegram-id" className="form-label">
                Telegram User ID
              </label>
              <input
                id="telegram-id"
                type="text"
                className="form-input"
                placeholder="e.g. 123456789"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                disabled={sending}
              />
            </div>

            <div className="form-group">
              <label htmlFor="message-text" className="form-label">
                Message
              </label>
              <textarea
                id="message-text"
                className="form-input"
                placeholder="Type your message here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={sending}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending}
              style={{ width: "100%" }}
            >
              {sending ? "Sending..." : "Send Message"}
            </button>
          </form>
        </div>

        {/* Info Card */}
        <div className="glass-card" style={{ marginTop: 20 }}>
          <h3 className="glass-card-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={18} /> How it works
          </h3>
          <p className="text-sm text-muted" style={{ lineHeight: 1.7 }}>
            This sends a message via the Pyrogram userbot directly to the user&apos;s
            Telegram chat. The message will appear as if sent from your account
            and will be logged in the <strong>message_logs</strong> table as a
            bot response.
          </p>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
