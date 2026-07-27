export interface AdminWaitlistMember {
  id: string;
  email: string;
  source: string;
  product_id: string | null;
  theme: 'light' | 'dark' | null;
  marketing_consent: boolean;
  consented_at: string | null;
  consent_version: string | null;
  signed_up_at: string;
  verified_at: string | null;
  unsubscribed_at: string | null;
  session_count: number;
  total_active_seconds: number;
  top_section: string | null;
}

export interface AdminAnalyticsSession {
  id: string;
  session_key: string;
  member_id: string | null;
  member_email: string | null;
  started_at: string;
  ended_at: string;
  active_seconds: number;
  theme: 'light' | 'dark' | null;
  device_type: string;
  section_dwell: Record<string, number>;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export interface AdminPage<T> {
  page: number;
  per_page: number;
  total: number;
  data: T[];
}
