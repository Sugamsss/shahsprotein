import React from 'react';
import { useWaitlist } from '../../context/WaitlistContext';

export const AvatarGroup: React.FC = () => {
  const { waitlistCount } = useWaitlist();

  // Local avatar asset paths
  const avatars = [
    '/assets/avatar-1.png',
    '/assets/avatar-2.png',
    '/assets/avatar-3.png',
    '/assets/avatar-4.png',
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
