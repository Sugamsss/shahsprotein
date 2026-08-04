import React from 'react';
import { ScanSearch, UsersRound, Utensils, type LucideIcon } from 'lucide-react';
import { Container } from '../layout/Container';
import { valuesData, valuesHeading } from '../../data/values';
import type { ValueIconType } from '../../types/values';

const valueIconMap: Record<ValueIconType, LucideIcon> = {
  utensils: Utensils,
  'scan-search': ScanSearch,
  'users-round': UsersRound,
};

export const ValuesSection: React.FC = () => (
  <section
    id="values"
    className="snap-section"
    aria-label="Core Values"
    style={{
      minHeight: '100vh',
      paddingTop: 'calc(var(--header-height) + var(--space-8))',
      paddingBottom: 'var(--space-12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }}
  >
    <Container>
      <div className="values-intro">
        <h2 className="values-heading">{valuesHeading}</h2>
        <div className="values-grid">
          {valuesData.map((value) => {
            const Icon = valueIconMap[value.iconType];

            return (
              <article className="glass-card values-card" key={value.id}>
                <div className="values-icon-circle" aria-hidden="true">
                  <Icon size={24} strokeWidth={1.8} />
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
