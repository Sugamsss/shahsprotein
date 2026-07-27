import React from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';

export const AccountSettings: React.FC = () => {
  const [password, setPassword] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword('');
    setConfirmation('');
    setMessage('Password updated successfully.');
  };

  return (
    <section className="admin-view">
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">ACCOUNT</p>
          <h2>Settings</h2>
          <p className="admin-muted">Manage access to the owner console.</p>
        </div>
      </div>
      <Card style={{ maxWidth: '34rem' }}>
        <h3 style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>Change password</h3>
        <p className="admin-muted">Replace the temporary password after your first login.</p>
        <form className="admin-form" onSubmit={updatePassword}>
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" icon={<KeyRound size={17} />} autoComplete="new-password" required />
          <Input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm new password" icon={<KeyRound size={17} />} autoComplete="new-password" required />
          {error && <p className="admin-error">{error}</p>}
          {message && <p style={{ color: '#16a34a', fontSize: 'var(--font-size-sm)' }}>{message}</p>}
          <Button type="submit" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</Button>
        </form>
      </Card>
    </section>
  );
};
