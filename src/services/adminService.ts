import { AdminAnalyticsSession, AdminPage, AdminWaitlistMember } from '../types/admin';
import { supabase } from './supabaseClient';

export class AdminService {
  static async getWaitlist(page = 1, perPage = 50, search = ''): Promise<AdminPage<AdminWaitlistMember>> {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.rpc('get_admin_waitlist', {
      p_page: page,
      p_per_page: perPage,
      p_search: search || null,
    });
    if (error) throw error;
    return data as AdminPage<AdminWaitlistMember>;
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
