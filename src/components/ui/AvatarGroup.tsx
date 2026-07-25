import React from 'react';
import { useWaitlist } from '../../context/WaitlistContext';

export const AvatarGroup: React.FC = () => {
  const { waitlistCount } = useWaitlist();

  // Avatar placeholder URLs
  const avatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {avatars.map((url, idx) => (
          <img
            key={idx}
            src={url}
            alt="Waitlist Member"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid var(--color-bg-main)',
              marginLeft: idx === 0 ? 0 : '-10px',
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          fontWeight: 500,
        }}
      >
        <strong style={{ color: 'var(--color-text-primary)' }}>{waitlistCount}+ people</strong> have already joined!
      </span>
    </div>
  );
};
