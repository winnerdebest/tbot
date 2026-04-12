-- ============================================================
-- PHASE 1: Supabase Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table: user_profiles
-- Stores Telegram user info + their AI-generated lifestyle summary
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    telegram_id   BIGINT PRIMARY KEY,
    username      TEXT,
    first_name    TEXT NOT NULL,
    lifestyle_summary TEXT DEFAULT 'New user. No data yet.',
    last_active   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Table: message_logs
-- Stores every message exchanged (user + bot) for context & analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS message_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id   BIGINT NOT NULL REFERENCES user_profiles(telegram_id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('user', 'bot')),
    content       TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes for query performance
-- ============================================================

-- Fast lookups of messages by user (used in context retrieval & summarizer)
CREATE INDEX IF NOT EXISTS idx_message_logs_telegram_id
    ON message_logs(telegram_id);

-- Fast ordering by time (used when fetching recent messages)
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at
    ON message_logs(created_at DESC);

-- Composite index for the most common query pattern:
-- "get last N messages for user X ordered by time"
CREATE INDEX IF NOT EXISTS idx_message_logs_user_time
    ON message_logs(telegram_id, created_at DESC);

-- ============================================================
-- Row Level Security (RLS)
-- Enabled for best practice. Using service_role key bypasses RLS,
-- but these policies allow authenticated access if needed later.
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Allow full access for the service role (your backend)
CREATE POLICY "Service role full access on user_profiles"
    ON user_profiles
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on message_logs"
    ON message_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);
