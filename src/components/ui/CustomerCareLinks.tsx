import React from 'react';
import { Phone } from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { siteConfig } from '../../data/siteConfig';
import { careCallUrl, careWhatsappUrl } from '../../utils/contact';

/** Call and WhatsApp actions for the customer care line. The caller shows the "Customer care" label. */
export const CustomerCareLinks: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { display } = siteConfig.contact.care;

  return (
    <span className={`care-links ${className}`}>
      <a href={careCallUrl()} className="care-link" aria-label={`Call customer care on ${display}`}>
        <Phone size={14} aria-hidden="true" />
        Call
      </a>
      <a
        href={careWhatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="care-link"
        aria-label={`WhatsApp customer care on ${display}`}
      >
        <WhatsAppIcon size={14} />
        WhatsApp
      </a>
    </span>
  );
};
