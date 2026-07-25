import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { Card } from '../ui/Card';
import { faqsData } from '../../data/faqs';
import { ChevronDown } from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal';

export const FAQSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(faqsData[0].id);
  const sectionRef = useScrollReveal();

  const toggleAccordion = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      id="faq"
      ref={sectionRef}
      className="reveal"
      style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}
      aria-label="Frequently Asked Questions"
    >
      <Container>
        <SectionHeader badge="FREQUENTLY ASKED QUESTIONS" title="Got questions? We've got answers." />

        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {faqsData.map((faq) => {
            const isOpen = openId === faq.id;
            return (
              <Card
                key={faq.id}
                interactive
                onClick={() => toggleAccordion(faq.id)}
                style={{
                  padding: 'var(--space-6)',
                  backgroundColor: isOpen ? 'var(--color-bg-faq-active)' : undefined,
                  transition:
                    'background-color var(--transition-normal), transform var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal)',
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAccordion(faq.id);
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
                  <h4 style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-text-primary)', margin: 0 }}>
                    {faq.question}
                  </h4>
                  <ChevronDown
                    size={20}
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform var(--transition-fast)',
                      color: 'var(--color-text-secondary)',
                      flexShrink: 0,
                    }}
                  />
                </button>
                <div
                  id={`faq-answer-${faq.id}`}
                  style={{
                    maxHeight: isOpen ? '500px' : '0px',
                    overflow: 'hidden',
                    opacity: isOpen ? 1 : 0,
                    transition: 'max-height 0.35s ease, opacity 0.35s ease, margin-top 0.35s ease',
                    marginTop: isOpen ? '0.75rem' : '0px',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {faq.answer}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
};

