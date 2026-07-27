import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Mail,
  RefreshCw,
  Search,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { AdminService } from '../../services/adminService';
import { AdminPage, AdminWaitlistMember } from '../../types/admin';
import { exportToCsv } from '../../utils/exportToCsv';
import MemberDetailDrawer from './MemberDetailDrawer';
import EmailComposer from './EmailComposer';

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ['', 'active', 'unsubscribed', 'bounced', 'spam'] as const;
const SOURCE_OPTIONS = ['', 'hero', 'product', 'modal', 'newsletter', 'referral'] as const;

const AdminWaitlist: React.FC = () => {
  // Data
  const [page, setPage] = useState<AdminPage<AdminWaitlistMember> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Detail drawer
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null);

  // Email composer
  const [composeForMember, setComposeForMember] = useState<{ id: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await AdminService.getWaitlist(1, PAGE_SIZE, search, statusFilter);
      setPage(result);
      setSelectedIds([]);
    } catch {
      setError('Could not load waitlist data.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(load, 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Client-side source filtering
  const filteredData = useMemo(() => {
    if (!page?.data) return [];
    if (!sourceFilter) return page.data;
    return page.data.filter((m) => m.source === sourceFilter);
  }, [page, sourceFilter]);

  const allSelected = filteredData.length > 0 && selectedIds.length === filteredData.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredData.map((m) => m.id));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const exportRows = () => {
    if (!page) return;
    const rows = page.data.map((m) => [
      m.email,
      m.source,
      m.product_id || '',
      m.theme || '',
      m.status || '',
      (m.tags || []).join('; '),
      m.marketing_consent ? 'Yes' : 'No',
      m.signed_up_at,
      String(m.session_count),
      String(m.total_active_seconds),
      m.top_section || '',
    ]);
    exportToCsv(
      'shahs-nutrition-members.csv',
      [
        'Email', 'Source', 'Product', 'Theme', 'Status', 'Tags',
        'Consent', 'Signed up', 'Sessions', 'Active seconds', 'Top section',
      ],
      rows,
    );
  };

  const getStatusClass = (status?: string) => {
    if (!status) return '';
    return `admin-status--${status}`;
  };

  return (
    <section className="admin-view">
      {/* Header */}
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">PEOPLE</p>
          <h2>Members</h2>
          <p className="admin-muted">
            {page?.total ?? '—'} total members
            {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {selectedIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setComposeForMember({ id: '', email: '' })}
            >
              <Mail size={15} />
              Email ({selectedIds.length})
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={exportRows} disabled={!page}>
            <Download size={15} />
            Export
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={15} />
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="admin-toolbar" style={{ maxWidth: '100%', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 280px', minWidth: 200 }}>
          <Input
            placeholder="Search email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search size={17} />}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          aria-label="Toggle filters"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={16} />
          Filters
          {(statusFilter || sourceFilter) && <span className="admin-source-badge" style={{ marginLeft: '0.25rem' }}>active</span>}
        </Button>
      </div>

      {showFilters && (
        <div className="admin-filter-bar">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="admin-filter-select"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="admin-filter-select"
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            {SOURCE_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {(statusFilter || sourceFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStatusFilter(''); setSourceFilter(''); }}
            >
              <X size={14} />
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Error */}
      {error && <p className="admin-error">{error}</p>}

      {/* Table */}
      <div className="admin-table-card glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && !page && (
          <div className="admin-loading-spinner">
            <RefreshCw size={18} className="admin-spin" />
            Loading members…
          </div>
        )}

        {!loading && !error && filteredData.length === 0 && (
          <div className="admin-empty-state">
            <User size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <p>{search || statusFilter || sourceFilter ? 'No members match your filters.' : 'No members yet.'}</p>
          </div>
        )}

        {filteredData.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table" role="grid" aria-label="Members table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all displayed members"
                    />
                  </th>
                  <th>Email</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Tags</th>
                  <th>Consent</th>
                  <th>Sessions</th>
                  <th>Active time</th>
                  <th>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((member) => {
                  const isSelected = selectedIds.includes(member.id);
                  return (
                    <tr
                      key={member.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => setDetailMemberId(member.id)}
                      style={{ cursor: 'pointer' }}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setDetailMemberId(member.id); }}
                      role="row"
                      aria-label={`Member ${member.email}`}
                    >
                      <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                        <input
                          type="checkbox"
                          className="admin-checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(member.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${member.email}`}
                        />
                      </td>
                      <td>{member.email}</td>
                      <td>
                        <span className="admin-source-badge">{member.source}</span>
                      </td>
                      <td>
                        {member.status && (
                          <span className={`admin-status ${getStatusClass(member.status)}`}>
                            {member.status}
                          </span>
                        )}
                      </td>
                      <td>
                        {member.tags && member.tags.length > 0 && (
                          <div className="admin-tags-list" style={{ gap: '0.25rem' }}>
                            {member.tags.slice(0, 3).map((t) => (
                              <span key={t} className="admin-tag" style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem' }}>
                                {t}
                              </span>
                            ))}
                            {member.tags.length > 3 && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                +{member.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>{member.marketing_consent ? 'Yes' : 'No'}</td>
                      <td>{member.session_count}</td>
                      <td>
                        {member.total_active_seconds < 60
                          ? `${member.total_active_seconds}s`
                          : `${Math.floor(member.total_active_seconds / 60)}m`}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(member.signed_up_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer with total */}
        {page && page.total > PAGE_SIZE && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border-subtle)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}>
            Showing {filteredData.length} of {page.total} members. Use search to find specific members.
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {detailMemberId && (
        <MemberDetailDrawer
          memberId={detailMemberId}
          onClose={() => setDetailMemberId(null)}
          onSendEmail={(id, email) => {
            setDetailMemberId(null);
            setComposeForMember({ id, email });
          }}
        />
      )}

      {/* Email Composer (for selected members or individual) */}
      {composeForMember && (
        <EmailComposer
          memberIds={
            composeForMember.id
              ? [composeForMember.id]
              : selectedIds.length > 0
              ? selectedIds
              : filteredData.map((m) => m.id)
          }
          memberEmail={composeForMember.email || undefined}
          onClose={() => setComposeForMember(null)}
          onSent={() => { load(); }}
        />
      )}
    </section>
  );
};

export default AdminWaitlist;
