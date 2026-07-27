import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { AdminService } from '../../services/adminService';
import { AdminAnalyticsSession, AdminPage } from '../../types/admin';
import { exportToCsv } from '../../utils/exportToCsv';

export const AdminAnalytics: React.FC = () => {
  const [page, setPage] = React.useState<AdminPage<AdminAnalyticsSession> | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => { AdminService.getAnalytics(1, 100).then(setPage).catch(() => setError('Could not load analytics data.')).finally(() => undefined); }, []);
  const exportRows = () => page && exportToCsv('shahs-nutrition-analytics.csv', ['Member email', 'Started', 'Ended', 'Active seconds', 'Theme', 'Device', 'Top sections'], page.data.map((session) => [session.member_email || 'Anonymous', session.started_at, session.ended_at, String(session.active_seconds), session.theme || '', session.device_type, Object.entries(session.section_dwell || {}).sort(([, a], [, b]) => b - a).slice(0, 3).map(([key, value]) => `${key}: ${value}s`).join('; ')]));
  return <section className="admin-view"><div className="admin-view-header"><div><p className="admin-eyebrow">BEHAVIOR</p><h2>Analytics sessions</h2><p className="admin-muted">{page?.total ?? '—'} consented sessions captured.</p></div><Button variant="secondary" onClick={exportRows} disabled={!page}><Download size={16} /> Export CSV</Button></div>{error && <p className="admin-error">{error}</p>}<Card className="admin-table-card">{!page && !error ? <p className="admin-muted">Loading analytics…</p> : page?.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Started</th><th>Active</th><th>Theme</th><th>Device</th><th>Sections</th></tr></thead><tbody>{page.data.map((session) => <tr key={session.id}><td>{session.member_email || 'Anonymous'}</td><td>{new Date(session.started_at).toLocaleString()}</td><td>{session.active_seconds}s</td><td>{session.theme || '—'}</td><td>{session.device_type}</td><td>{Object.entries(session.section_dwell || {}).sort(([, a], [, b]) => b - a).slice(0, 2).map(([key, value]) => `${key} ${value}s`).join(', ') || '—'}</td></tr>)}</tbody></table></div> : <p className="admin-muted">No analytics sessions found.</p>}</Card></section>;
};
