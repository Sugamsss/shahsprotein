/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set to "true" to send site events outside the live site (local Supabase testing). */
  readonly VITE_TRACK_EVENTS?: string;
}
