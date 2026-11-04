import React from 'react';
import { adminCopy } from '../../data/adminCopy';

/** "Mfg 4 Nov 2026 · Exp 3 May 2027": each date kept whole, the line breaks between them. */
export const DatesLine: React.FC<{ mfg: string; exp: string | null; className?: string }> = ({ mfg, exp, className }) => {
  const [first, ...rest] = adminCopy.batches.mfgExp(mfg, exp).split(' · ');
  return (
    <span className={`adm-dates${className ? ` ${className}` : ''}`}>
      <span>{first}</span>
      {rest.map((part) => <React.Fragment key={part}>{' · '}<span>{part}</span></React.Fragment>)}
    </span>
  );
};
