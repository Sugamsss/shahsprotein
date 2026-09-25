import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { AdminService } from '../../services/adminService';
import { AdminAnalyticsSession, AdminOrderClicks, AdminPage } from '../../types/admin';
import { exportToCsv } from '../../utils/exportToCsv';
import { productsData } from '../../data/products';

const RANGES = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: 'all', label: 'All time', days: null },
] as const;

const PLACE_LABELS: Record<string, string> = {
  header: 'Header button',
  hero: 'Hero',
  banner: 'Bottom banner',
  footer: 'Footer',
  faq: 'FAQ, "Ask us"',
  product: 'Product card',
  'product-details': 'Product popup',
  nutrition: 'Popup, nutrition note',
  'order-popup': 'Order popup, sent',
};

/**
 * "product:raggi-jaggi" → "Product card · Raggi Jaggi".
 * "order-popup:hero" → "Order popup, sent · Hero" (the place that opened the popup).
 * "order-popup:chat" is the empty popup's direct WhatsApp link, not a Send.
 * Unknown sources show as-is.
 */
const describeSource = (source: string): string => {
  const [place, productId] = source.split(':');
  const placeLabel = PLACE_LABELS[place] ?? source;
  if (!productId) return placeLabel;
  if (source === 'order-popup:chat') return 'Order popup, "Rather just chat?" link';
  if (place === 'order-popup') return `${placeLabel} · ${PLACE_LABELS[productId] ?? productId}`;
  const productName = productsData.find((product) => product.id === productId)?.name ?? productId;
  return `${placeLabel} · ${productName}`;
};

const OrderClicksPanel: React.FC = () => {
  const [range, setRange] = React.useState<(typeof RANGES)[number]['value']>('30');
  const [clicks, setClicks] = React.useState<AdminOrderClicks | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const days = RANGES.find((option) => option.value === range)?.days ?? null;
    AdminService.getOrderClicks(days)
      .then((data) => { if (current) setClicks(data); })
      .catch(() => {
        if (!current) return;
        // Don't leave the previous range's numbers under the new label.
        setClicks(null);
        setError('Could not load WhatsApp order clicks.');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [range]);

  const maxClicks = Math.max(1, ...(clicks?.by_source.map((row) => row.clicks) ?? []));
  const devices = clicks?.by_device.map((row) => `${row.clicks} ${row.device_type}`).join(' · ');

  return (
    <Card className={`admin-table-card admin-clicks-card${loading && clicks ? ' is-loading' : ''}`} aria-busy={loading}>
      <div className="admin-clicks-head">
        <div>
          <h3>WhatsApp order clicks</h3>
          <p className="admin-muted">
            {clicks ? `${clicks.total} ${clicks.total === 1 ? 'click' : 'clicks'}${devices ? ` · ${devices}` : ''}` : 'Which buttons send people to WhatsApp.'}
          </p>
        </div>
        <select
          className="admin-filter-select"
          value={range}
          onChange={(event) => setRange(event.target.value as typeof range)}
          aria-label="Time range for order clicks"
        >
          {RANGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!clicks && loading && <p className="admin-muted">Loading order clicks…</p>}
      {clicks && clicks.by_source.length === 0 && <p className="admin-muted">No order clicks in this period yet.</p>}
      {clicks && clicks.by_source.length > 0 && (
        <ul className="admin-clicks-list">
          {clicks.by_source.map((row) => (
            <li key={row.source}>
              <div className="admin-clicks-row">
                <span className="admin-clicks-label" title={row.source}>{describeSource(row.source)}</span>
                <span className="admin-clicks-count">{row.clicks}</span>
              </div>
              <div className="admin-clicks-bar" aria-hidden="true"><span style={{ width: `${(row.clicks / maxClicks) * 100}%` }} /></div>
              <div className="admin-clicks-meta">Last click {new Date(row.last_click_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export const AdminAnalytics: React.FC = () => {
  const [page, setPage] = React.useState<AdminPage<AdminAnalyticsSession> | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => { AdminService.getAnalytics(1, 100).then(setPage).catch(() => setError('Could not load analytics data.')).finally(() => undefined); }, []);
  const exportRows = () => page && exportToCsv('shahs-nutrition-analytics.csv', ['Member email', 'Started', 'Ended', 'Active seconds', 'Theme', 'Device', 'Top sections'], page.data.map((session) => [session.member_email || 'Anonymous', session.started_at, session.ended_at, String(session.active_seconds), session.theme || '', session.device_type, Object.entries(session.section_dwell || {}).sort(([, a], [, b]) => b - a).slice(0, 3).map(([key, value]) => `${key}: ${value}s`).join('; ')]));
  return <section className="admin-view"><div className="admin-view-header"><div><p className="admin-eyebrow">BEHAVIOR</p><h2>Analytics</h2><p className="admin-muted">WhatsApp order clicks and consented sessions.</p></div></div><OrderClicksPanel /><div className="admin-view-header"><div><h3 className="admin-subhead">Consented sessions</h3><p className="admin-muted">{page?.total ?? '—'} consented sessions captured.</p></div><Button variant="secondary" onClick={exportRows} disabled={!page}><Download size={16} /> Export CSV</Button></div>{error && <p className="admin-error">{error}</p>}<Card className="admin-table-card">{!page && !error ? <p className="admin-muted">Loading analytics…</p> : page?.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Started</th><th>Active</th><th>Theme</th><th>Device</th><th>Sections</th></tr></thead><tbody>{page.data.map((session) => <tr key={session.id}><td>{session.member_email || 'Anonymous'}</td><td>{new Date(session.started_at).toLocaleString()}</td><td>{session.active_seconds}s</td><td>{session.theme || '—'}</td><td>{session.device_type}</td><td>{Object.entries(session.section_dwell || {}).sort(([, a], [, b]) => b - a).slice(0, 2).map(([key, value]) => `${key} ${value}s`).join(', ') || '—'}</td></tr>)}</tbody></table></div> : <p className="admin-muted">No analytics sessions found.</p>}</Card></section>;
};
