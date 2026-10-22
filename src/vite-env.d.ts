/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set to "true" to send site events outside the live site (local Supabase testing). */
  readonly VITE_TRACK_EVENTS?: string;
  /** Optional browser key for address suggestions (Places). Without it the address is typed in. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

/** This build's id (vite.config.ts). Admin code only: the landing bundle never reads it. */
declare const __ADMIN_BUILD__: string;
