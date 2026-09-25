import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { Card } from '../ui/Card';
import { faqsData } from '../../data/faqs';
import { ChevronDown } from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { FAQItem } from '../../types/faqs';
import { OrderLink } from '../ui/OrderLink';
import { CustomerCareLinks } from '../ui/CustomerCareLinks';
import { siteConfig } from '../../data/siteConfig';

const FAQCardItem: React.FC<{
  faq: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ faq, isOpen, onToggle }) => {
  const questionId = `faq-question-${faq.id}`;
  const answerId = `faq-answer-${faq.id}`;

  return (
    // The card toggles on click, except inside the open answer (people tap it to
    // read or copy). The button inside the heading is what keyboards and
    // screen readers use.
    <Card interactive onClick={onToggle} className={`faq-item${isOpen ? ' is-open' : ''}`}>
      <h3 className="faq-item__question">
        <button
          type="button"
          id={questionId}
          className="faq-item__toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-expanded={isOpen}
          aria-controls={answerId}
        >
          <span>{faq.question}</span>
          <span className="faq-item__icon" aria-hidden="true">
            <ChevronDown size={18} />
          </span>
        </button>
      </h3>

      {/* Closed answers leave the accessibility tree, so screen readers don't read all of them. */}
      <div
        id={answerId}
        role="region"
        aria-labelledby={questionId}
        className="faq-item__answer"
        onClick={(e) => e.stopPropagation()}
        aria-hidden={!isOpen}
        {...(!isOpen && { inert: '' })}
      >
        <div className="faq-item__answer-inner">
          <p>{faq.answer}</p>
        </div>
      </div>
    </Card>
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
      className="reveal snap-section faq-section"
      aria-label="Frequently Asked Questions"
    >
      <Container>
        <SectionHeader badge="FREQUENTLY ASKED QUESTIONS" title="Questions you might have" />

        <div className="faq-list">
          {faqsData.map((faq) => (
            <FAQCardItem
              key={faq.id}
              faq={faq}
              isOpen={openId === faq.id}
              onToggle={() => toggleAccordion(faq.id)}
            />
          ))}
        </div>

        {/* The FAQ can't cover everything. Questions go to the order chat; problems with
            an existing order go to customer care, so they don't land in the sales chat. */}
        <div className="faq-help">
          <p>
            Have another question?{' '}
            <OrderLink source="faq" ask variant="text">Ask us on WhatsApp.</OrderLink>
          </p>
          <p className="faq-help__care">
            <span>
              Need help with an order you've placed?{' '}
              {/* Kept on one line, so the number never splits from its label. */}
              <span className="faq-help__care-line">
                {siteConfig.contact.care.label}: <strong>{siteConfig.contact.care.display}</strong>
              </span>
            </span>
            <CustomerCareLinks />
          </p>
        </div>
      </Container>
    </section>
  );
};
