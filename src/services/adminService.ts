import {
  AdminAnalyticsSession,
  AdminEmailPayload,
  AdminPage,
  AdminSummary,
  AdminWaitlistMember,
  EmailCampaign,
  MemberDetail,
} from '../types/admin';
import { supabase } from './supabaseClient';

export class AdminService {
  static async getWaitlist(
    page = 1,
    perPage = 50,
    search = '',
    statusFilter = '',
  ): Promise<AdminPage<AdminWaitlistMember>> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_admin_waitlist', {
      p_page: page,
      p_per_page: perPage,
      p_search: search || null,
      p_status: statusFilter || null,
    });
    if (error) throw error;
    return data as AdminPage<AdminWaitlistMember>;
  }

  static async getSummary(): Promise<AdminSummary> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_admin_summary');
    if (error) throw error;
    return data as AdminSummary;
  }

  static async getMemberDetail(memberId: string): Promise<MemberDetail> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_admin_member_detail', {
      p_member_id: memberId,
    });
    if (error) throw error;
    const raw = data as {
      member: Omit<MemberDetail, 'sessions' | 'emails' | 'session_count' | 'total_active_seconds' | 'top_section' | 'device_type' | 'referrer' | 'utm_source' | 'utm_medium' | 'utm_campaign'>;
      sessions: MemberDetail['sessions'];
      email_log: Array<{ id: string; subject: string; sent_at: string; opened_at: string | null; campaign_id: string | null }>;
      session_count: number;
      total_active_seconds: number;
    };
    const latestSession = raw.sessions[0];
    const topSection = Object.entries(
      raw.sessions.reduce<Record<string, number>>((totals, session) => {
        Object.entries(session.section_dwell || {}).forEach(([section, seconds]) => {
          totals[section] = (totals[section] || 0) + seconds;
        });
        return totals;
      }, {}),
    ).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
    return {
      ...raw.member,
      session_count: raw.session_count,
      total_active_seconds: raw.total_active_seconds,
      top_section: topSection,
      device_type: latestSession?.device_type ?? null,
      referrer: latestSession?.referrer ?? null,
      utm_source: latestSession?.utm_source ?? null,
      utm_medium: latestSession?.utm_medium ?? null,
      utm_campaign: latestSession?.utm_campaign ?? null,
      sessions: raw.sessions,
      emails: raw.email_log.map((email) => ({
        id: email.id,
        subject: email.subject || '(No subject)',
        sent_at: email.sent_at,
        opened_at: email.opened_at,
        campaign_name: email.campaign_id ? 'Campaign' : 'Individual email',
      })),
    };
  }

  static async updateMemberProfile(
    memberId: string,
    params: { p_notes?: string | null; p_tags?: string[]; p_status?: string },
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.rpc('update_admin_member', {
      p_member_id: memberId,
      p_notes: params.p_notes ?? null,
      p_tags: params.p_tags ?? null,
      p_status: params.p_status ?? null,
    });
    if (error) throw error;
  }

  static async getEmailCampaigns(): Promise<EmailCampaign[]> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_admin_campaigns', { p_page: 1, p_per_page: 100 });
    if (error) throw error;
    const page = data as { data: Array<{ id: string; name: string; subject: string; sent_at: string | null; status: EmailCampaign['status']; total_sent: number; opened: number }> };
    return (page.data || []).map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      sent_at: campaign.sent_at,
      status: campaign.status,
      recipient_count: campaign.total_sent,
      opened_count: campaign.opened,
    }));
  }

  static async sendAdminEmail(payload: AdminEmailPayload): Promise<void> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.functions.invoke('send-admin-email', {
      body: {
        member_ids: payload.memberIds,
        subject: payload.subject,
        html_body: payload.htmlBody,
        campaign_name: payload.campaignName,
      },
    });
    if (error) {
      let message = error.message;
      const context = 'context' in error ? error.context : null;
      if (context instanceof Response) {
        try {
          const body = await context.clone().json() as { error?: string };
          message = body.error || message;
        } catch {
          // Keep the provider's fallback error message.
        }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
  }

  static async getAnalytics(page = 1, perPage = 50): Promise<AdminPage<AdminAnalyticsSession>> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_admin_analytics', {
      p_page: page,
      p_per_page: perPage,
    });
    if (error) throw error;
    return data as AdminPage<AdminAnalyticsSession>;
  }
}
