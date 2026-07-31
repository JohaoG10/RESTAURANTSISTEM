import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Clave compartida entre pestañas para la misma sesión en localStorage */
export const AUTH_STORAGE_KEY = 'sb-session';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben definirse en .env.local'
  );
}

function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl ?? '', supabaseAnonKey ?? '', {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: AUTH_STORAGE_KEY,
      flowType: 'pkce',
    },
  });
}

type SupabaseGlobal = typeof globalThis & {
  __sistemaRestauranteSupabase__?: SupabaseClient<Database>;
};

const globalStore = globalThis as SupabaseGlobal;

/**
 * Cliente único (singleton). Evita múltiples createClient que compiten por la sesión
 * entre pestañas o recargas en caliente de Vite.
 */
export const supabase: SupabaseClient<Database> =
  globalStore.__sistemaRestauranteSupabase__ ?? createSupabaseClient();

if (typeof window !== 'undefined') {
  globalStore.__sistemaRestauranteSupabase__ = supabase;
}
