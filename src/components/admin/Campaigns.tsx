import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Plus, RefreshCw, Send } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminWaitlistMember, EmailCampaign } from '../../types/admin';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import EmailComposer from './EmailComposer';

type ComposerScope = 'selected' | 'all' | null;

const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [members, setMembers] = useState<AdminWaitlistMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composerScope, setComposerScope] = useState<ComposerScope>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [campaignsData, membersData] = await Promise.all([
        AdminService.getEmailCampaigns(),
        AdminService.getWaitlist(1, 200, ''),
      ]);
      setCampaigns(campaignsData);
      setMembers(membersData.data || []);
    } catch {
      setError('Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getStatusClass = (s: EmailCampaign['status']) => {
    switch (s) {
      case 'draft': return 'admin-campaign-status--draft';
      case 'sending': return 'admin-campaign-status--sending';
      case 'sent': return 'admin-campaign-status--sent';
      case 'scheduled': return 'admin-campaign-status--sending';
      case 'cancelled': return 'admin-campaign-status--draft';
    }
  };

  const toggleMember = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === filteredMembers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMembers.map((m) => m.id));
    }
  };

  const filteredMembers = members.filter((m) =>
    m.email.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  return (
    <section className="admin-view">
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">OUTREACH</p>
          <h2>Email campaigns</h2>
          <p className="admin-muted">
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} · {members.length} eligible members
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {/* Campaign Cards */}
      {loading && !campaigns.length ? (
        <div className="admin-loading-spinner">
          <RefreshCw size={18} className="admin-spin" />
          Loading campaigns…
        </div>
      ) : (
        <div className="admin-campaigns-grid" style={{ marginBottom: 'var(--space-8)' }}>
          {campaigns.length === 0 && (
            <Card className="admin-table-card">
              <div className="admin-empty-state">
                <Mail size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p>No campaigns yet. Compose your first email below.</p>
              </div>
            </Card>
          )}
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="admin-campaign-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <h4>{campaign.name}</h4>
                <span className={`admin-campaign-status ${getStatusClass(campaign.status)}`}>
                  {campaign.status}
                </span>
              </div>
              <p className="admin-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: '0.25rem' }}>
                {campaign.subject}
              </p>
              {campaign.sent_at && (
                <p className="admin-muted" style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>
                  Sent {new Date(campaign.sent_at).toLocaleDateString()}
                </p>
              )}
              <div className="admin-campaign-stats">
                <div className="admin-campaign-stat">
                  <div className="admin-campaign-stat-value">{campaign.recipient_count}</div>
                  <div className="admin-campaign-stat-label">Sent</div>
                </div>
                <div className="admin-campaign-stat">
                  <div className="admin-campaign-stat-value">{campaign.opened_count}</div>
                  <div className="admin-campaign-stat-label">Opened</div>
                </div>
                <div className="admin-campaign-stat">
                  <div className="admin-campaign-stat-value">
                    {campaign.recipient_count > 0
                      ? `${Math.round((campaign.opened_count / campaign.recipient_count) * 100)}%`
                      : '—'}
                  </div>
                  <div className="admin-campaign-stat-label">Rate</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Member Selection for New Campaign */}
      <Card className="admin-table-card">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-family-heading)', fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>
            <Plus size={18} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
            New campaign
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search members…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="input"
              style={{ maxWidth: '20rem', padding: '0.55rem 1rem' }}
              aria-label="Search members"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => setComposerScope('selected')}
              disabled={selectedIds.length === 0}
            >
              <Send size={15} />
              Email selected ({selectedIds.length})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setComposerScope('all')}
              disabled={filteredMembers.length === 0}
            >
              <Send size={15} />
              Email all ({filteredMembers.length})
            </Button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    className="admin-checkbox"
                    checked={selectedIds.length === filteredMembers.length && filteredMembers.length > 0}
                    onChange={toggleAll}
                    aria-label="Select all members"
                  />
                </th>
                <th>Email</th>
                <th>Source</th>
                <th>Status</th>
                <th>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                    {memberSearch ? 'No members matching search.' : 'No members found.'}
                  </td>
                </tr>
              )}
              {filteredMembers.map((member) => (
                <tr
                  key={member.id}
                  className={selectedIds.includes(member.id) ? 'selected' : ''}
                  onClick={() => toggleMember(member.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      checked={selectedIds.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      aria-label={`Select ${member.email}`}
                    />
                  </td>
                  <td>{member.email}</td>
                  <td><span className="admin-source-badge">{member.source}</span></td>
                  <td>
                    {member.status && (
                      <span className={`admin-status admin-status--${member.status}`}>
                        {member.status}
                      </span>
                    )}
                  </td>
                  <td>{new Date(member.signed_up_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Email Composer Modal */}
      {composerScope && (
        <EmailComposer
          memberIds={
            composerScope === 'all'
              ? filteredMembers.map((m) => m.id)
              : selectedIds
          }
          onClose={() => setComposerScope(null)}
          onSent={load}
        />
      )}
    </section>
  );
};

export default Campaigns;
