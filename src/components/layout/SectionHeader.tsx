import React from 'react';
import { Badge } from '../ui/Badge';

export interface SectionHeaderProps {
  badge?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  centered?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  badge,
  title,
  subtitle,
  centered = true,
}) => {
  return (
    <div
      style={{
        textAlign: centered ? 'center' : 'left',
        marginBottom: 'var(--space-12)',
        maxWidth: centered ? '720px' : '100%',
        marginLeft: centered ? 'auto' : 0,
        marginRight: centered ? 'auto' : 0,
      }}
    >
      {badge && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Badge>{badge}</Badge>
        </div>
      )}
      <h2
        style={{
          fontFamily: 'var(--font-family-heading)',
          fontSize: 'var(--font-size-3xl)',
          color: 'var(--color-text-primary)',
          marginBottom: subtitle ? 'var(--space-3)' : 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};
