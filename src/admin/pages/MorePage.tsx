import React, { useState } from 'react';
import { ChevronRight, Download, Mail, Settings, Ticket, type LucideIcon } from 'lucide-react';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { adminCopy as copy } from '../../data/adminCopy';
import { AdminLink as Link } from '../router';

const Row: React.FC<{ Icon: LucideIcon; text: readonly string[] }> = ({ Icon, text: [title, sub] }) => (
  <>
    <span className="adm-list__icon" aria-hidden="true"><Icon size={20} /></span>
    <span className="adm-list__main"><span className="adm-list__title">{title}</span><span className="adm-list__sub">{sub}</span></span>
    <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
  </>
);

// Phone only: what doesn't fit in the tab bar.
const MorePage: React.FC = () => {
  const [exportNote, setExportNote] = useState('');
  return (
    <div className="adm-page">
      <h1 className="adm-title">{copy.more.title}</h1>
      <section className="adm-card adm-list">
        <Link to="/admin/coupons"><Row Icon={Ticket} text={copy.more.coupons} /></Link>
        <Link to="/admin/email-list"><Row Icon={Mail} text={copy.more.emailList} /></Link>
        {/* The Orders screen brings the real export (get_admin_orders + csv.ts). */}
        <button type="button" onClick={() => setExportNote(copy.more.exportSoon)}><Row Icon={Download} text={copy.more.exportOrders} /></button>
        <Link to="/admin/settings"><Row Icon={Settings} text={copy.more.settings} /></Link>
        <div className="adm-list__static">
          <span className="adm-list__title">{copy.appearance.label}</span>
          <ThemeToggle />
        </div>
      </section>
      <p className="adm-muted adm-center" role="status">{exportNote}</p>
      <p className="adm-muted adm-center">{copy.more.footer}</p>
    </div>
  );
};

export default MorePage;
