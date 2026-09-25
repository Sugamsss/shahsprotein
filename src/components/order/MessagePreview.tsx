import React, { useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useOrder } from '../../context/OrderContext';
import { siteConfig } from '../../data/siteConfig';
import { orderMessageParts } from '../../utils/orderMessage';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';

const copy = siteConfig.order;

/**
 * "See your message": the exact WhatsApp text, as a chat bubble. Missing name or
 * pincode show as highlighted blanks where they'll go. Closed each time the popup opens.
 */
export const MessagePreview: React.FC = () => {
  const { code, sendLines, name, pincode, messageCoupon } = useOrder();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const parts = useMemo(
    () => orderMessageParts({ code, lines: sendLines, name, pincode, coupon: messageCoupon }, { blanks: true }),
    [code, sendLines, name, pincode, messageCoupon],
  );

  return (
    <div className="order-preview">
      <button
        type="button"
        className="order-preview__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <WhatsAppIcon size={16} />
        <span>{open ? copy.previewHide : copy.previewShow}</span>
        <ChevronDown size={17} className="order-preview__chevron" aria-hidden="true" />
      </button>
      <div id={panelId} className="order-preview__panel" hidden={!open}>
        <div className="order-preview__who">
          <span className="order-preview__avatar" aria-hidden="true">
            <WhatsAppIcon size={16} />
          </span>
          <span>
            <strong>{copy.previewTo}</strong>
            <small>{copy.previewReply}</small>
          </span>
        </div>
        <p className="order-bubble">
          {parts.map((part, index) =>
            part.blank ? <mark key={index}>{part.text}</mark> : <React.Fragment key={index}>{part.text}</React.Fragment>,
          )}
        </p>
      </div>
    </div>
  );
};
