import React from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { valuesData } from '../../data/values';
import { Leaf, Dumbbell, IndianRupee } from 'lucide-react';
import { IconType } from '../../types/product';

export const ValuesSection: React.FC = () => {
  const renderIcon = (type: IconType) => {
    switch (type) {
      case 'leaf':
        return <Leaf size={28} color="var(--color-text-accent)" />;
      case 'dumbbell':
        return <Dumbbell size={28} color="var(--color-text-accent)" />;
      case 'currency':
        return <IndianRupee size={28} color="var(--color-text-accent)" />;
      default:
        return <Leaf size={28} color="var(--color-text-accent)" />;
    }
  };

  return (
    <section style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
      <Container>
        <SectionHeader badge="WHAT WE BELIEVE IN" title="" />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 'var(--space-8)',
          }}
        >
          {valuesData.map((val) => (
            <div
              key={val.id}
              style={{
                textAlign: 'center',
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-bg-badge)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {renderIcon(val.iconType)}
              </div>
              <h3
                style={{
                  fontSize: 'var(--font-size-lg)',
                  color: 'var(--color-text-primary)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {val.title}
              </h3>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                {val.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
};
