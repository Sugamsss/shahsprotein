import React from 'react';
import { Download, Search } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { AdminService } from '../../services/adminService';
import { AdminPage, AdminWaitlistMember } from '../../types/admin';
import { exportToCsv } from '../../utils/exportToCsv';

export const AdminWaitlist: React.FC = () => {
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState<AdminPage<AdminWaitlistMember> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try { setPage(await AdminService.getWaitlist(1, 100, search)); }
    catch { setError('Could not load waitlist data. Confirm your owner account is enabled.'); }
    finally { setLoading(false); }
  }, [search]);

  React.useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [load]);

  const exportRows = () => {
    if (!page) return;
    exportToCsv('shahs-nutrition-waitlist.csv', ['Email', 'Source', 'Product', 'Theme', 'Consent', 'Signed up', 'Active seconds', 'Top section'], page.data.map((member) => [member.email, member.source, member.product_id || '', member.theme || '', member.marketing_consent ? 'Yes' : 'No', member.signed_up_at, String(member.total_active_seconds), member.top_section || '']));
  };

  return <section className="admin-view">
    <div className="admin-view-header"><div><p className="admin-eyebrow">PEOPLE</p><h2>Waitlist members</h2><p className="admin-muted">{page?.total ?? '—'} total signups with consented engagement summaries.</p></div><Button variant="secondary" onClick={exportRows} disabled={!page}><Download size={16} /> Export CSV</Button></div>
    <div className="admin-toolbar"><Input placeholder="Search email address" value={search} onChange={(event) => setSearch(event.target.value)} icon={<Search size={17} />} /></div>
    {error && <p className="admin-error">{error}</p>}
    <Card className="admin-table-card">
      {loading ? <p className="admin-muted">Loading members…</p> : page?.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Email</th><th>Source</th><th>Theme</th><th>Consent</th><th>Signed up</th><th>Active time</th><th>Top section</th></tr></thead><tbody>{page.data.map((member) => <tr key={member.id}><td>{member.email}</td><td>{member.source}</td><td>{member.theme || '—'}</td><td>{member.marketing_consent ? 'Yes' : 'No'}</td><td>{new Date(member.signed_up_at).toLocaleString()}</td><td>{member.total_active_seconds}s</td><td>{member.top_section || '—'}</td></tr>)}</tbody></table></div> : <p className="admin-muted">No waitlist members found.</p>}
    </Card>
  </section>;
};
