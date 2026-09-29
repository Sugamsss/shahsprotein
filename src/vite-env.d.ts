/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set to "true" to send site events outside the live site (local Supabase testing). */
  readonly VITE_TRACK_EVENTS?: string;
}

/** This build's id (vite.config.ts). Admin code only: the landing bundle never reads it. */
declare const __ADMIN_BUILD__: string;
