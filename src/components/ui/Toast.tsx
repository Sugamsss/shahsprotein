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
        zIndex: 'var(--z-toast)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.85rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--color-bg-card)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${isSuccess ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
        boxShadow: 'var(--shadow-card)',
        color: 'var(--color-text-primary)',
        fontSize: 'var(--font-size-sm)',
        maxWidth: '380px',
      }}
    >
      {isSuccess ? (
        <CheckCircle2 size={20} color="#22c55e" style={{ flexShrink: 0 }} />
      ) : (
        <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toastMessage}</span>
      <button
        type="button"
        onClick={clearToast}
        aria-label="Close notification"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px',
          flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
};

