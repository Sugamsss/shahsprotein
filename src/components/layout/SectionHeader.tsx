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
}) => (
  <div className={`section-header${centered ? ' section-header--centered' : ''}`}>
    {badge && (
      <div className="section-header__badge">
        <Badge>{badge}</Badge>
      </div>
    )}
    <h2 className="section-header__title">{title}</h2>
    {subtitle && <p className="section-header__subtitle">{subtitle}</p>}
  </div>
);
