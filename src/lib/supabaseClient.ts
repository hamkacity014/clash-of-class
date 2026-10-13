import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  '';

// Cek apakah kredensial valid (bukan placeholder kosong atau default)
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project-id')
);

const globalForSupabase = globalThis as unknown as {
  supabaseInstance?: SupabaseClient<any, any, any>;
};

export const supabase: SupabaseClient<any, any, any> | null = isSupabaseConfigured
  ? (globalForSupabase.supabaseInstance ??= createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: typeof window !== 'undefined',
        autoRefreshToken: typeof window !== 'undefined',
      },
    }))
  : null;
