import React, { useState } from 'react';
import { Send, X } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { Button } from '../ui/Button';

interface EmailComposerProps {
  memberIds: string[];
  memberEmail?: string;
  onClose: () => void;
  onSent: () => void;
}

const EmailComposer: React.FC<EmailComposerProps> = ({ memberIds, memberEmail, onClose, onSent }) => {
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !htmlBody.trim()) {
      setError('Subject and body are required.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await AdminService.sendAdminEmail({
        memberIds,
        subject: subject.trim(),
        htmlBody: htmlBody.trim(),
        campaignName: campaignName.trim() || undefined,
      });
      onSent();
      onClose();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="admin-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Compose email"
      >
        <div className="admin-drawer-header">
          <h3>Compose email</h3>
          <button
            onClick={onClose}
            aria-label="Close composer"
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
          <form onSubmit={handleSend} className="admin-composer-body">
            <div>
              <label htmlFor="composer-recipients">Recipients</label>
              <p className="admin-muted" style={{ marginTop: '0.25rem' }}>
                {memberIds.length} member{memberIds.length !== 1 ? 's' : ''} selected
                {memberEmail && <> · {memberEmail}</>}
              </p>
            </div>

            <div>
              <label htmlFor="composer-campaign">Campaign name (optional)</label>
              <input
                id="composer-campaign"
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Launch announcement"
              />
            </div>

            <div>
              <label htmlFor="composer-subject">Subject</label>
              <input
                id="composer-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
                required
              />
            </div>

            <div>
              <label htmlFor="composer-body">HTML Body</label>
              <textarea
                id="composer-body"
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                placeholder={`<h1>Hello!</h1>\n<p>Your message here…</p>`}
                required
              />
            </div>

            {error && <p className="admin-error">{error}</p>}

            <div style={{ display: 'flex', gap: 'var(--space-3)', paddingTop: 'var(--space-2)' }}>
              <Button type="submit" variant="primary" disabled={sending}>
                <Send size={16} />
                {sending ? 'Sending…' : 'Send email'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EmailComposer;
