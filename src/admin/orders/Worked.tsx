import React from 'react';
import { Calculator } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';

/** "From FAMILY prices, before delivery.", the code in bold: under a total that filled itself in. */
export const WorkedFrom: React.FC<{ code: string | null }> = ({ code }) => {
  const text = adminCopy.order.workedFrom(code);
  const at = code ? text.indexOf(code) : -1;
  const [before, after] = code && at >= 0 ? [text.slice(0, at), text.slice(at + code.length)] : [text, ''];
  return (
    <span className="adm-worked">
      <Calculator size={14} strokeWidth={1.75} aria-hidden="true" />
      {before}{code && at >= 0 && <b>{code}</b>}{after}
    </span>
  );
};
