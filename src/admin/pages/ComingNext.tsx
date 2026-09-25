import React from 'react';
import { adminCopy as copy } from '../../data/adminCopy';

/** A page the screen work replaces: its title and "Coming next". */
export const ComingNext: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="adm-page">
    <h1 className="adm-title">{title}</h1>
    <p className="adm-muted">{copy.stub}</p>
    {children}
  </div>
);
