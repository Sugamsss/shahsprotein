import React, { useState } from 'react';
import { ChevronRight, Download, Mail, Settings, Ticket, type LucideIcon } from 'lucide-react';
import { adminCopy as copy } from '../../data/adminCopy';
import { getCoupons, getEmailList } from '../api';
import { ExportSheet } from '../orders/ExportSheet';
import { AdminLink as Link } from '../router';
import { useRpc } from '../useRpc';

const Row: React.FC<{ Icon: LucideIcon; title: string; sub: string }> = ({ Icon, title, sub }) => (
  <>
    <span className="adm-list__icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
    <span className="adm-list__main"><span className="adm-list__title">{title}</span><span className="adm-list__sub">{sub}</span></span>
    <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
  </>
);

// Phone only (spec 2.13): what doesn't fit in the tab bar. The lines under
// Coupons and Email list are live counts once they load.
const MorePage: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const coupons = useRpc(getCoupons, []);
  const emails = useRpc(getEmailList, []);
  const couponsOn = coupons.data?.filter((c) => c.active && !(c.expires_at && Date.parse(c.expires_at) <= Date.now())).length;
  const people = emails.data?.members.length;

  return (
    <div className="adm-page">
      <h1 className="adm-title">{copy.more.title}</h1>
      <section className="adm-card adm-list">
        <Link to="/admin/coupons">
          <Row Icon={Ticket} title={copy.more.coupons[0]} sub={couponsOn === undefined ? copy.more.coupons[1] : copy.moreCounts.couponsOn(couponsOn)} />
        </Link>
        <Link to="/admin/email-list">
          <Row Icon={Mail} title={copy.more.emailList[0]} sub={people === undefined ? copy.more.emailList[1] : copy.emailList.people(people)} />
        </Link>
        <button type="button" onClick={() => setExporting(true)}>
          <Row Icon={Download} title={copy.more.exportOrders[0]} sub={copy.more.exportOrders[1]} />
        </button>
        <Link to="/admin/settings"><Row Icon={Settings} title={copy.more.settings[0]} sub={copy.more.settings[1]} /></Link>
      </section>
      <p className="adm-muted adm-center">{copy.more.footer}</p>
      <ExportSheet isOpen={exporting} onClose={() => setExporting(false)} />
    </div>
  );
};

export default MorePage;
