import React from 'react';
import { useWaitlist } from '../../context/WaitlistContext';

export interface AvatarGroupProps {
  count?: number;
  avatars?: string[];
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({ count, avatars }) => {
  const { waitlistCount } = useWaitlist();

  // Local avatar asset paths
  const avatarList = avatars ?? [
    '/assets/avatar-1.png',
    '/assets/avatar-2.png',
    '/assets/avatar-3.png',
    '/assets/avatar-4.png',
  ];

  const displayCount = count ?? waitlistCount;

  return (
    <div className="avatar-group">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {avatarList.map((url, idx) => (
          <img
            key={idx}
            src={url}
            alt="Waitlist Member"
            width={28}
            height={28}
            loading="lazy"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid var(--color-bg-main)',
              marginLeft: idx === 0 ? 0 : '-8px',
            }}
          />
        ))}
      </div>
      <span
        className="avatar-group__label"
      >
        <strong style={{ color: 'var(--color-text-primary)' }}>{displayCount}+ people</strong> have already joined!
      </span>
    </div>
  );
};
