import React from 'react';
import { useWaitlist } from '../../context/WaitlistContext';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toastMessage, toastType, clearToast } = useWaitlist();

  if (!toastMessage) return null;

  const isSuccess = toastType === 'success';

  return (
    <div
      className="animate-fade-in"
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.85rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--color-bg-card)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${isSuccess ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
        boxShadow: 'var(--shadow-card)',
        color: 'var(--color-text-primary)',
        fontSize: 'var(--font-size-sm)',
        maxWidth: '400px',
      }}
    >
      {isSuccess ? (
        <CheckCircle2 size={20} color="#22c55e" />
      ) : (
        <AlertCircle size={20} color="#ef4444" />
      )}
      <span style={{ flex: 1 }}>{toastMessage}</span>
      <button onClick={clearToast} style={{ color: 'var(--color-text-muted)', padding: '2px' }}>
        <X size={16} />
      </button>
    </div>
  );
};
