import React, { useEffect, useState, useRef } from 'react';
import { Container } from '../layout/Container';

const LINE1_TOKENS = [
  { text: 'We', isHighlight: false },
  { text: 'believe', isHighlight: false },
  { text: 'that', isHighlight: false },
  { text: 'Nutrition', isHighlight: true, type: 'nutrition' },
  { text: 'should', isHighlight: false },
  { text: 'be', isHighlight: false },
  { text: 'High Quality,', isHighlight: true, type: 'quality' },
  { text: 'not', isHighlight: false },
  { text: 'High', isHighlight: false },
  { text: 'Price,', isHighlight: false },
];

const LINE2_TOKENS = [
  { text: 'and', isHighlight: false },
  { text: 'each', isHighlight: false },
  { text: 'of', isHighlight: false },
  { text: 'our', isHighlight: false },
  { text: 'products', isHighlight: false },
];

const LINE3_TOKENS = [
  { text: 'reflect', isHighlight: false },
  { text: 'that.', isHighlight: false },
];

export const ValuesSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  let globalWordCount = 0;

  const renderToken = (token: typeof LINE1_TOKENS[0]) => {
    const delay = globalWordCount * 140;
    globalWordCount++;

    let content: React.ReactNode = token.text;

    if (token.type === 'nutrition') {
      content = (
        <span className="text-gradient" style={{ textDecoration: 'underline' }}>
          Nutrition
        </span>
      );
    } else if (token.type === 'quality') {
      content = (
        <span className="text-gradient" style={{ whiteSpace: 'nowrap', textDecoration: 'underline' }}>
          High Quality,
        </span>
      );
    }

    return (
      <span
        key={globalWordCount}
        className={`liquid-word ${isRevealed ? 'is-revealed' : ''}`}
        style={{
          marginRight: '0.3em',
          animationDelay: `${delay}ms`,
        }}
      >
        {content}
      </span>
    );
  };

  return (
    <section
      id="values"
      ref={sectionRef}
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
        <div style={{ textAlign: 'center', maxWidth: '860px', margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: 'var(--font-family-heading)',
              fontSize: 'clamp(2.1rem, 4.5vw, 3.25rem)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              lineHeight: 1.4,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            <div>{LINE1_TOKENS.map(renderToken)}</div>
            <div>{LINE2_TOKENS.map(renderToken)}</div>
            <div>{LINE3_TOKENS.map(renderToken)}</div>
          </h2>
        </div>
      </Container>
    </section>
  );
};

