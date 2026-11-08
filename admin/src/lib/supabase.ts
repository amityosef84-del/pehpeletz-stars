import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const configured = Boolean(url && anon);
export const supabase: SupabaseClient | null = configured
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
