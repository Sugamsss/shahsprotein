import React from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { valuesData } from '../../data/values';
import { Leaf, Dumbbell, IndianRupee } from 'lucide-react';
import { IconType } from '../../types/product';
import { BrandValue } from '../../types/values';
import { useScrollReveal } from '../../hooks/useScrollReveal';

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

const ValueCardItem: React.FC<{ value: BrandValue; index: number }> = ({ value, index }) => {
  const cardRef = useScrollReveal<HTMLDivElement>();
  const delayClass = `delay-${((index % 5) + 1) * 100}`;

  return (
    <div ref={cardRef} className={`values-card reveal ${delayClass}`}>
      <div className="values-icon-circle">
        {renderIcon(value.iconType)}
      </div>
      <div className="values-card-content">
        <h3 className="values-card-title">
          {value.title}
        </h3>
        <p className="values-card-desc">
          {value.description}
        </p>
      </div>
    </div>
  );
};

export const ValuesSection: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section id="values" ref={sectionRef} style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
      <Container>
        <SectionHeader badge="WHAT WE BELIEVE IN" title="" />

        <div className="values-grid">
          {valuesData.map((val, idx) => (
            <ValueCardItem key={val.id} value={val} index={idx} />
          ))}
        </div>
      </Container>
    </section>
  );
};

