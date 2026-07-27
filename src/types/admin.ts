export type MemberStatus = 'active' | 'unsubscribed' | 'bounced' | 'spam';

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
  status?: MemberStatus;
  tags?: string[];
  notes?: string | null;
  device_type?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
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

/** ─── Dashboard Summary ─── */
export interface AdminSummary {
  total_members: number;
  verified_members: number;
  unsubscribed_members: number;
  marketing_consent: number;
  total_sessions: number;
  avg_active_seconds: number;
  top_sources: { source: string; count: number }[];
  signups_today: number;
  signups_this_week: number;
}

/** ─── Member Session (from detail RPC) ─── */
export interface MemberSession {
  id: string;
  session_key: string;
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

/** ─── Member Email Record ─── */
export interface MemberEmail {
  id: string;
  subject: string;
  sent_at: string;
  opened_at: string | null;
  campaign_name: string | null;
}

/** ─── Rich Member Detail ─── */
export interface MemberDetail {
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
  notes: string | null;
  tags: string[];
  status: MemberStatus;
  device_type: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  sessions: MemberSession[];
  emails: MemberEmail[];
}

/** ─── Email Campaign ─── */
export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  sent_at: string | null;
  recipient_count: number;
  opened_count: number;
  status: 'draft' | 'scheduled' | 'sent' | 'sending' | 'cancelled';
}

/** ─── Admin Email Send Payload ─── */
export interface AdminEmailPayload {
  memberIds: string[];
  subject: string;
  htmlBody: string;
  campaignName?: string;
}
