import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Mail, LockKeyhole } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('Unable to sign in. Check your credentials.');
      return;
    }
    navigate('/admin/waitlist', { replace: true });
  };

  return (
    <main className="admin-auth-page">
      <Card className="admin-auth-card">
        <p className="admin-eyebrow">OWNER ACCESS</p>
        <h1>Waitlist dashboard</h1>
        <p className="admin-muted">Sign in to view members and consented engagement data.</p>
        <form onSubmit={handleSubmit} className="admin-form">
          <Input type="email" placeholder="Owner email" value={email} onChange={(event) => setEmail(event.target.value)} icon={<Mail size={17} />} required />
          <Input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} icon={<LockKeyhole size={17} />} required />
          {error && <p className="admin-error">{error}</p>}
          <Button type="submit" fullWidth disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </Card>
    </main>
  );
};
