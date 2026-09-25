import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, TicketPercent } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminCoupon } from '../../types/admin';
import { Button } from '../ui/Button';
import CouponDrawer from './CouponDrawer';
import { formatCouponDate, hasEnded } from './couponDates';

const FLASH_MS = 1600;

type DrawerState = { mode: 'add' } | { mode: 'edit'; coupon: AdminCoupon } | null;

const countLine = (coupons: AdminCoupon[]) => {
  const total = coupons.length;
  const on = coupons.filter((c) => c.active && !hasEnded(c.expires_at)).length;
  return `${total} ${total === 1 ? 'code' : 'codes'} · ${on} on`;
};

const StatusPill: React.FC<{ coupon: AdminCoupon }> = ({ coupon }) => {
  if (hasEnded(coupon.expires_at)) {
    return <span className="admin-status admin-status--unsubscribed">Ended</span>;
  }
  return coupon.active ? (
    <span className="admin-status admin-status--active">On</span>
  ) : (
    <span className="admin-status admin-status--unsubscribed">Off</span>
  );
};

const Coupons: React.FC = () => {
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setCoupons(await AdminService.getCoupons());
    } catch {
      setLoadError("Couldn't load your codes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!flashId) return;
    const timer = window.setTimeout(() => setFlashId(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  const replaceCoupon = (saved: AdminCoupon) =>
    setCoupons((prev) => (prev ?? []).map((c) => (c.id === saved.id ? saved : c)));

  const toggle = async (coupon: AdminCoupon) => {
    if (togglingIds.includes(coupon.id)) return;
    setToggleError('');
    setTogglingIds((prev) => [...prev, coupon.id]);
    try {
      replaceCoupon(await AdminService.setCouponActive(coupon.id, !coupon.active));
    } catch {
      setToggleError("Couldn't change that code. Please try again.");
    } finally {
      setTogglingIds((prev) => prev.filter((x) => x !== coupon.id));
    }
  };

  const openDrawer = (next: NonNullable<DrawerState>, opener: HTMLElement) => {
    openerRef.current = opener;
    setDrawer(next);
  };

  const closeDrawer = () => {
    setDrawer(null);
    // Back to the button that opened it. The empty state's button is gone once
    // the first code exists, so fall back to the page heading.
    const opener = openerRef.current;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else headingRef.current?.focus();
    });
  };

  const handleSaved = (saved: AdminCoupon) => {
    setCoupons((prev) => {
      const list = prev ?? [];
      return list.some((c) => c.id === saved.id)
        ? list.map((c) => (c.id === saved.id ? saved : c))
        : [saved, ...list];
    });
    setFlashId(saved.id);
    closeDrawer();
  };

  const addButton = (
    <Button size="sm" onClick={(e) => openDrawer({ mode: 'add' }, e.currentTarget)}>
      <Plus size={15} aria-hidden="true" />
      Add a code
    </Button>
  );

  const hasCoupons = coupons !== null && coupons.length > 0;

  return (
    <section className="admin-view" aria-labelledby="admin-coupons-title">
      <div className="admin-view-header">
        <div>
          <p className="admin-eyebrow">ORDERS</p>
          <h2 id="admin-coupons-title" ref={headingRef} tabIndex={-1}>Coupons</h2>
          <p className="admin-muted">{coupons ? countLine(coupons) : '—'}</p>
        </div>
        <div className="admin-view-actions">
          {addButton}
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh codes">
            <RefreshCw size={15} className={loading && coupons ? 'admin-spin' : undefined} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p className="admin-muted admin-coupons-help">
        Customers type these in the order popup. They see the description when a code works, never an
        amount. You work out the discount in the chat.
      </p>

      {loadError && <p className="admin-error admin-coupons-message" role="alert">{loadError}</p>}
      {toggleError && <p className="admin-error admin-coupons-message" role="alert">{toggleError}</p>}

      <div className="admin-table-card glass-card admin-coupons-card">
        {loading && !coupons && (
          <div className="admin-loading-spinner">
            <RefreshCw size={18} className="admin-spin" aria-hidden="true" />
            Loading codes…
          </div>
        )}

        {coupons && coupons.length === 0 && (
          <div className="admin-empty-state">
            <TicketPercent size={32} className="admin-empty-state__icon" aria-hidden="true" />
            <p className="admin-empty-state__title">No coupon codes yet.</p>
            <p>Add one, and customers can use it in the order popup.</p>
            <div className="admin-empty-state__action">{addButton}</div>
          </div>
        )}

        {hasCoupons && (
          <div className="admin-table-wrap">
            <table className="admin-table admin-coupons-table">
              <caption className="admin-sr-only">Coupon codes, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Status</th>
                  <th scope="col">What customers see</th>
                  <th scope="col">Ends</th>
                  <th scope="col">Minimum</th>
                  <th scope="col"><span className="admin-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => {
                  const toggling = togglingIds.includes(coupon.id);
                  const toggleLabel = coupon.active ? 'Turn off' : 'Turn on';
                  return (
                    <tr key={coupon.id} className={flashId === coupon.id ? 'is-flash' : undefined}>
                      <td className="admin-coupon-code">{coupon.code}</td>
                      <td><StatusPill coupon={coupon} /></td>
                      <td>{coupon.description}</td>
                      <td>
                        {coupon.expires_at ? (
                          formatCouponDate(coupon.expires_at)
                        ) : (
                          <span className="admin-table-muted">No end date</span>
                        )}
                      </td>
                      <td>
                        {coupon.minimum_note || <span className="admin-table-muted">—</span>}
                      </td>
                      <td>
                        <div className="admin-coupon-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void toggle(coupon)}
                            // aria-disabled, not disabled, so keyboard focus stays on the button.
                            aria-disabled={toggling}
                            aria-busy={toggling}
                            aria-label={toggling ? `Saving ${coupon.code}` : `${toggleLabel} ${coupon.code}`}
                          >
                            {toggling ? '…' : toggleLabel}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => openDrawer({ mode: 'edit', coupon }, e.currentTarget)}
                            aria-label={`Edit ${coupon.code}`}
                          >
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && (
        <CouponDrawer
          coupon={drawer.mode === 'edit' ? drawer.coupon : null}
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
};

export default Coupons;
