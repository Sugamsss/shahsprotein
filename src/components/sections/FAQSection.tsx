import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { Card } from '../ui/Card';
import { faqsData } from '../../data/faqs';
import { ChevronDown } from 'lucide-react';

export const FAQSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(faqsData[0].id);

  const toggleAccordion = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
      <Container>
        <SectionHeader badge="FREQUENTLY ASKED QUESTIONS" title="Got questions? We've got answers." />

        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {faqsData.map((faq) => {
            const isOpen = openId === faq.id;
            return (
              <Card key={faq.id} interactive onClick={() => toggleAccordion(faq.id)} style={{ padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <h4 style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-text-primary)' }}>
                    {faq.question}
                  </h4>
                  <ChevronDown
                    size={20}
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform var(--transition-fast)',
                      color: 'var(--color-text-secondary)',
                    }}
                  />
                </div>
                {isOpen && (
                  <p
                    style={{
                      marginTop: '0.75rem',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {faq.answer}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
};
