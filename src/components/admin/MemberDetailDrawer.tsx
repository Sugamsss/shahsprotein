import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  Mail,
  Monitor,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { MemberDetail, MemberStatus } from '../../types/admin';
import { Button } from '../ui/Button';

interface MemberDetailDrawerProps {
  memberId: string;
  onClose: () => void;
  onSendEmail: (memberId: string, email: string) => void;
}

const STATUS_OPTIONS: MemberStatus[] = ['active', 'unsubscribed', 'bounced', 'spam'];

const DeviceIcon: React.FC<{ device: string }> = ({ device }) => {
  const d = device?.toLowerCase() || '';
  if (d.includes('mobile')) return <Smartphone size={14} />;
  if (d.includes('tablet')) return <Tablet size={14} />;
  return <Monitor size={14} />;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

const MemberDetailDrawer: React.FC<MemberDetailDrawerProps> = ({ memberId, onClose, onSendEmail }) => {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<MemberStatus>('active');
  const [tagInput, setTagInput] = useState('');
  const [dirty, setDirty] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await AdminService.getMemberDetail(memberId);
      setDetail(data);
      setNotes(data.notes || '');
      setTags(data.tags || []);
      setStatus(data.status || 'active');
    } catch {
      setError('Could not load member details.');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      await AdminService.updateMemberProfile(memberId, {
        p_notes: notes || null,
        p_tags: tags,
        p_status: status,
      });
      setDirty(false);
    } catch {
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }, [memberId, notes, tags, status]);

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setDirty(true);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    setDirty(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const handleClose = () => {
    if (dirty) {
      void saveProfile().then(onClose);
    } else {
      onClose();
    }
  };

  return (
    <>
      <div className="admin-drawer-overlay" onClick={handleClose} aria-hidden="true" />
      <div
        className="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `Member: ${detail.email}` : 'Member details'}
      >
        <div className="admin-drawer-header">
          <h3>
            {loading ? 'Loading…' : detail?.email || 'Member details'}
          </h3>
          <button
            onClick={handleClose}
            aria-label="Close panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border-subtle)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="admin-drawer-body">
          {loading && (
            <div className="admin-loading-spinner">
              <Clock size={18} className="admin-spin" />
              Loading member…
            </div>
          )}

          {error && <p className="admin-error">{error}</p>}

          {detail && !loading && (
            <>
              {/* Signup Details */}
              <div className="admin-detail-section">
                <h4>Signup Details</h4>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Email</span>
                  <span className="admin-detail-value">{detail.email}</span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Source</span>
                  <span className="admin-detail-value">
                    <span className="admin-source-badge">{detail.source}</span>
                  </span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Product</span>
                  <span className="admin-detail-value">{detail.product_id || '—'}</span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Signed up</span>
                  <span className="admin-detail-value">
                    {new Date(detail.signed_up_at).toLocaleString()}
                  </span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Verified</span>
                  <span className="admin-detail-value">
                    {detail.verified_at ? new Date(detail.verified_at).toLocaleString() : 'No'}
                  </span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Consent</span>
                  <span className="admin-detail-value">
                    {detail.marketing_consent ? 'Yes' : 'No'}
                    {detail.consented_at && ` (${new Date(detail.consented_at).toLocaleDateString()})`}
                  </span>
                </div>
              </div>

              {/* Status / Tags / Notes */}
              <div className="admin-detail-section">
                <h4>Profile</h4>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Status</span>
                  <select
                    value={status}
                    onChange={(e) => { setStatus(e.target.value as MemberStatus); setDirty(true); }}
                    className="admin-filter-select"
                    aria-label="Member status"
                    style={{ minWidth: 140 }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Tags</span>
                  <div className="admin-tags-list">
                    {tags.map((tag) => (
                      <span key={tag} className="admin-tag">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="admin-tag-remove"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <span className="admin-tag-input-wrap">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={addTag}
                        placeholder="Add tag…"
                        className="admin-tag-input"
                        aria-label="Add a tag"
                      />
                    </span>
                  </div>
                </div>
                <div className="admin-detail-row" style={{ gridTemplateColumns: '1fr' }}>
                  <span className="admin-detail-label">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
                    className="admin-notes-textarea"
                    placeholder="Add internal notes about this member…"
                    aria-label="Member notes"
                  />
                </div>
              </div>

              {/* Device / UTM / Referrer */}
              <div className="admin-detail-section">
                <h4>Acquisition</h4>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Theme</span>
                  <span className="admin-detail-value">{detail.theme || '—'}</span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Device</span>
                  <span className="admin-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DeviceIcon device={detail.device_type || ''} />
                    {detail.device_type || '—'}
                  </span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">Referrer</span>
                  <span className="admin-detail-value">{detail.referrer || '—'}</span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">UTM Source</span>
                  <span className="admin-detail-value">{detail.utm_source || '—'}</span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">UTM Medium</span>
                  <span className="admin-detail-value">{detail.utm_medium || '—'}</span>
                </div>
                <div className="admin-detail-row">
                  <span className="admin-detail-label">UTM Campaign</span>
                  <span className="admin-detail-value">{detail.utm_campaign || '—'}</span>
                </div>
              </div>

              {/* Sessions */}
              <div className="admin-detail-section">
                <h4>
                  Sessions ({detail.sessions.length})
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '0.5rem' }}>
                    · {formatDuration(detail.total_active_seconds)} total
                  </span>
                </h4>
                {detail.sessions.length === 0 && (
                  <p className="admin-muted" style={{ fontStyle: 'italic' }}>No sessions recorded.</p>
                )}
                <div className="admin-sessions-list">
                  {detail.sessions.map((session) => (
                    <div key={session.id} className="admin-session-item">
                      <div className="admin-session-header">
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {new Date(session.started_at).toLocaleDateString()}
                        </span>
                        <div className="admin-session-meta">
                          <span><Clock size={12} /> {formatDuration(session.active_seconds)}</span>
                          <span><DeviceIcon device={session.device_type} /> {session.device_type}</span>
                          <span>{session.theme || '—'}</span>
                        </div>
                      </div>
                      {session.section_dwell && Object.keys(session.section_dwell).length > 0 && (
                        <div className="admin-section-dwell">
                          {Object.entries(session.section_dwell)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 5)
                            .map(([section, secs]) => (
                              <span key={section} className="admin-dwell-tag">
                                {section} {formatDuration(secs)}
                              </span>
                            ))}
                        </div>
                      )}
                      {(session.utm_source || session.referrer) && (
                        <div style={{ marginTop: '0.35rem', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                          {session.referrer && <span>ref: {session.referrer} </span>}
                          {session.utm_source && <span>utm: {session.utm_source}/{session.utm_medium || '—'}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Email History */}
              <div className="admin-detail-section">
                <h4>Email History ({detail.emails.length})</h4>
                {detail.emails.length === 0 && (
                  <p className="admin-muted" style={{ fontStyle: 'italic' }}>No emails sent yet.</p>
                )}
                <div className="admin-email-list">
                  {detail.emails.map((email) => (
                    <div key={email.id} className="admin-email-item">
                      <div>
                        <div className="admin-email-subject">{email.subject}</div>
                        <div className="admin-email-meta">
                          <span>{new Date(email.sent_at).toLocaleDateString()}</span>
                          {email.campaign_name && <span>{email.campaign_name}</span>}
                        </div>
                      </div>
                      <span
                        className={`admin-email-opened ${
                          email.opened_at ? 'admin-email-opened--yes' : 'admin-email-opened--no'
                        }`}
                      >
                        {email.opened_at ? `Opened ${new Date(email.opened_at).toLocaleDateString()}` : 'Not opened'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="admin-drawer-footer">
          {dirty && (
            <Button variant="primary" size="sm" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onSendEmail(memberId, detail?.email || '')}
            disabled={!detail}
          >
            <Mail size={15} />
            Send email
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
};

export default MemberDetailDrawer;
