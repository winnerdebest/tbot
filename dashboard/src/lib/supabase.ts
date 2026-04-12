/**
 * supabase.ts — Supabase client for the dashboard
 * Reads directly from Supabase for real-time data (users, messages).
 * Uses the anon key (read-only) for security.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey);
