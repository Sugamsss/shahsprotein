import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Clock,
  RefreshCw,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminSummary } from '../../types/admin';
import { Card } from '../ui/Card';

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

const AdminDashboard: React.FC = () => {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await AdminService.getSummary());
    } catch {
      setError('Could not load dashboard data. Confirm your owner account is enabled.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="admin-view">
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">OVERVIEW</p>
          <h2>Dashboard</h2>
          <p className="admin-muted">
            {summary
              ? `${summary.total_members} total members · ${summary.signups_today} today`
              : 'Key metrics at a glance'}
          </p>
        </div>
        <ButtonIcon onClick={load} disabled={loading} label="Refresh dashboard data">
          <RefreshCw size={16} />
        </ButtonIcon>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {loading && !summary && (
        <div className="admin-loading-spinner">
          <Clock size={18} />
          Loading dashboard…
        </div>
      )}

      {summary && (
        <>
          {/* Stat Cards */}
          <div className="admin-dashboard-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-label">Total members</div>
              <div className="admin-stat-value">{summary.total_members}</div>
              <div className="admin-stat-sub">All signups</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Verified</div>
              <div className="admin-stat-value">{summary.verified_members}</div>
              <div className="admin-stat-sub">
                {summary.total_members > 0
                  ? `${Math.round((summary.verified_members / summary.total_members) * 100)}% of total`
                  : '—'}
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Marketing consent</div>
              <div className="admin-stat-value">{summary.marketing_consent}</div>
              <div className="admin-stat-sub">
                {summary.total_members > 0
                  ? `${Math.round((summary.marketing_consent / summary.total_members) * 100)}% opted in`
                  : '—'}
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Signups today</div>
              <div className="admin-stat-value">{summary.signups_today}</div>
              <div className="admin-stat-sub">
                <TrendingUp size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                {summary.signups_this_week} this week
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
            {/* Top Sources */}
            <Card className="admin-table-card">
              <h4 style={{
                fontFamily: 'var(--font-family-heading)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 700,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 'var(--space-4)',
              }}>
                Top sources
              </h4>
              {summary.top_sources.length === 0 && (
                <p className="admin-muted" style={{ fontStyle: 'italic' }}>No data yet.</p>
              )}
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                {summary.top_sources.map((source) => {
                  const maxCount = Math.max(...summary.top_sources.map((s) => s.count));
                  const pct = maxCount > 0 ? (source.count / maxCount) * 100 : 0;
                  return (
                    <div key={source.source}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {source.source}
                        </span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{source.count}</span>
                      </div>
                      <div style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'var(--color-border-subtle)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: 'var(--color-accent-gradient)',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Engagement Summary */}
            <Card className="admin-table-card">
              <h4 style={{
                fontFamily: 'var(--font-family-heading)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 700,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 'var(--space-4)',
              }}>
                Engagement
              </h4>
              <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-badge)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-accent)',
                  }}>
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>
                      {summary.total_sessions}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Total sessions
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-badge)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-accent)',
                  }}>
                    <Clock size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>
                      {formatDuration(summary.avg_active_seconds)}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Avg. active time per member
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-badge)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-accent)',
                  }}>
                    <UserCheck size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>
                      {summary.unsubscribed_members}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Unsubscribed
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </section>
  );
};

/** Inline icon button matching the UI pattern. */
const ButtonIcon: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, label, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.55rem',
      borderRadius: 'var(--radius-full)',
      border: '1px solid var(--color-border-card)',
      color: 'var(--color-text-secondary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all var(--transition-fast)',
    }}
  >
    {children}
  </button>
);

export default AdminDashboard;
