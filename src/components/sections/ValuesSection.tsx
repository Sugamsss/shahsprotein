import React from 'react';
import { ScanSearch, UsersRound, Utensils, type LucideIcon } from 'lucide-react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { valuesData, valuesEyebrow, valuesHeading, valuesLabel } from '../../data/values';
import type { ValueIconType } from '../../types/values';

const valueIconMap: Record<ValueIconType, LucideIcon> = {
  utensils: Utensils,
  'scan-search': ScanSearch,
  'users-round': UsersRound,
};

export const ValuesSection: React.FC = () => (
  <section
    id="values"
    className="snap-section values-section"
    aria-label={valuesLabel}
  >
    <Container>
      <div className="values-intro">
        <div className="values-eyebrow">
          <Badge>{valuesEyebrow}</Badge>
        </div>
        <h2 className="values-heading">{valuesHeading}</h2>
        <div className="values-grid">
          {valuesData.map((value) => {
            const Icon = valueIconMap[value.iconType];

            return (
              <article className="glass-card values-card" key={value.id}>
                <div className="values-icon-circle" aria-hidden="true">
                  <Icon />
                </div>
                <div className="values-card-content">
                  <h3 className="values-card-title">{value.title}</h3>
                  <p className="values-card-desc">{value.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </Container>
  </section>
);
