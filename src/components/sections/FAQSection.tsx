import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { Card } from '../ui/Card';
import { faqsData } from '../../data/faqs';
import { ChevronDown } from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { FAQItem } from '../../types/faqs';

const FAQCardItem: React.FC<{
  faq: FAQItem;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ faq, isOpen, onToggle }) => {
  return (
    <div style={{ width: '100%' }}>
      <Card
        interactive
        onClick={onToggle}
          style={{
            padding: '1.25rem 1.5rem',
            backgroundColor: isOpen ? 'var(--color-bg-faq-active)' : undefined,
            borderColor: isOpen ? 'var(--color-border-hover)' : undefined,
            boxShadow: isOpen ? 'var(--shadow-card), 0 0 20px rgba(59, 130, 246, 0.12)' : undefined,
            transition:
              'background-color var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal)',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={isOpen}
            aria-controls={`faq-answer-${faq.id}`}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <h4
              style={{
                fontSize: 'var(--font-size-md)',
                fontWeight: 600,
                color: isOpen ? 'var(--color-text-accent)' : 'var(--color-text-primary)',
                margin: 0,
                transition: 'color 0.3s ease',
              }}
            >
              {faq.question}
            </h4>

            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: isOpen ? 'var(--color-bg-badge)' : 'var(--color-bg-pill)',
                border: isOpen ? '1px solid var(--color-border-badge)' : '1px solid var(--color-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isOpen ? 'var(--shadow-badge)' : 'none',
                flexShrink: 0,
              }}
            >
              <ChevronDown
                size={18}
                color={isOpen ? 'var(--color-text-accent)' : 'var(--color-text-secondary)'}
                style={{
                  transform: isOpen ? 'rotate(180deg) scale(1.1)' : 'rotate(0deg)',
                  transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
            </div>
          </button>

          <div
            id={`faq-answer-${faq.id}`}
            style={{
              display: 'grid',
              gridTemplateRows: isOpen ? '1fr' : '0fr',
              transition: 'grid-template-rows 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease',
              opacity: isOpen ? 1 : 0,
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <p
                style={{
                  paddingTop: '0.85rem',
                  marginTop: '0.5rem',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.65,
                  borderTop: '1px solid var(--color-border-subtle)',
                }}
              >
                {faq.answer}
              </p>
            </div>
          </div>
        </Card>
    </div>
  );
};

export const FAQSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(faqsData[0].id);
  const sectionRef = useScrollReveal<HTMLElement>();

  const toggleAccordion = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      id="faq"
      ref={sectionRef}
      className="reveal snap-section"
      style={{
        minHeight: '100vh',
        paddingTop: 'calc(var(--header-height) + var(--space-8))',
        paddingBottom: 'var(--space-12)',
        boxSizing: 'border-box',
      }}
      aria-label="Frequently Asked Questions"
    >
      <Container>
        <SectionHeader badge="FREQUENTLY ASKED QUESTIONS" title="Got questions? We've got answers." />

        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {faqsData.map((faq, index) => (
            <FAQCardItem
              key={faq.id}
              faq={faq}
              index={index}
              isOpen={openId === faq.id}
              onToggle={() => toggleAccordion(faq.id)}
            />
          ))}
        </div>
      </Container>
    </section>
  );
};

