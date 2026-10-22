import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { confirmWebsiteRequest, dismissWebsiteRequest, getWebsiteRequest, getWebsiteRequests } from '../api';
import { formatAge } from '../format';
import { LoadError, Skeleton } from '../parts';
import { ToastSlot, useToast } from '../toast';
import { useRpc } from '../useRpc';
import type { WebsiteRequest } from '../types';
import type { DeliveryAddress } from '../../types/delivery';
import { cleanDeliveryAddress, cleanPhone, formatDeliveryAddress, isValidDeliveryAddress } from '../../utils/deliveryAddress';
import { useUnsavedWork } from '../unsavedWork';

const copy = adminCopy.websiteRequests;
const addressText = (r: WebsiteRequest) => {
  const a = r.delivery_address;
  return a ? formatDeliveryAddress(a as DeliveryAddress) : r.pincode ? `Pincode ${r.pincode}` : copy.addressMissing;
};
const RequestCard: React.FC<{ request: WebsiteRequest; open: () => void }> = ({ request: r, open }) => (
  <button type="button" className="adm-card adm-request-card" onClick={open}>
    <span className="adm-request-card__head"><b>{r.name || copy.nameMissing}</b><time>{formatAge(r.created_at)}</time></span>
    <code>{r.code}</code>
    <span>{r.lines.map((l) => `${l.product_id} ${l.size} × ${l.quantity}`).join(' · ')}</span>
    <small>{addressText(r)}</small>
    <span className="adm-request-card__state">{copy.notConfirmed}<ChevronRight size={18} aria-hidden="true" /></span>
  </button>
);

const RequestsPage: React.FC = () => {
  const [state, setState] = useState<'pending' | 'dismissed'>('pending');
  const [selected, setSelected] = useState<WebsiteRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [received, setReceived] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<DeliveryAddress>({ premises: '', area: '', city: '', state: '', pincode: '', landmark: '' });
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<Array<{ before: string; before_id?: string }>>([]);
  const generation = useRef(0);
  const activeId = useRef<string | null>(null);
  const submitLock = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const confirmTitle = useRef<HTMLHeadingElement>(null);
  const baseline = useRef<{ name: string; phone: string; address: DeliveryAddress } | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const dirty = !!baseline.current && (name !== baseline.current.name || phone !== baseline.current.phone ||
    (['premises', 'area', 'city', 'state', 'pincode', 'landmark'] as const).some((key) => (address[key] ?? '') !== (baseline.current?.address[key] ?? '')));
  useUnsavedWork(() => dirty);
  const cursor = pages[pages.length - 1];
  const list = useRpc(() => getWebsiteRequests({ state, limit: 100, ...(search.trim() ? { search: search.trim() } : {}), ...(cursor ?? {}) }), [state, search, pages.length, cursor?.before, cursor?.before_id], { refreshOnFocus: true });
  const setFields = (r: WebsiteRequest) => {
    const nextAddress = r.delivery_address ?? { premises: '', area: '', city: '', state: '', pincode: r.pincode ?? '', landmark: '' };
    setName(r.name ?? ''); setPhone(r.phone ?? ''); setAddress(nextAddress);
    baseline.current = { name: r.name ?? '', phone: r.phone ?? '', address: { ...nextAddress } };
  };
  const open = async (request: WebsiteRequest) => {
    const requestGeneration = ++generation.current;
    activeId.current = request.id;
    setSelected(request); setDetailError(false); setDetailLoading(true); setReceived(false);
    setFields(request);
    try { const full = await getWebsiteRequest(request.id); if (generation.current === requestGeneration) { if (full) { setSelected(full); setFields(full); } else setDetailError(true); } }
    catch { if (generation.current === requestGeneration) setDetailError(true); }
    finally { if (generation.current === requestGeneration) setDetailLoading(false); }
  };
  const resetDetails = () => {
    if (!selected) return;
    setFields(selected);
  };

  const confirm = async () => {
    if (!selected || submitLock.current || !received || !complete) return;
    submitLock.current = true;
    const id = selected.id;
    setSubmitting(true);
    try {
      const cleanedAddress = cleanDeliveryAddress(address);
      const result = await confirmWebsiteRequest(id, { name, phone: cleanPhone(phone), delivery_address: cleanedAddress, pincode: cleanedAddress.pincode });
      if (activeId.current !== id) return;
      if (result.order) {
        setSelected(null); setConfirming(false);
        navigate(`/admin/orders/${encodeURIComponent(result.order.code)}`);
      } else {
        setSelected(null); setConfirming(false); if (result.state === 'dismissed') toast.show({ text: copy.concurrentDismissed }); await list.reload();
      }
    } catch (error) { if (activeId.current === id) toast.show({ text: error instanceof Error && error.message ? error.message : copy.saveFailed }); }
    finally { submitLock.current = false; setSubmitting(false); }
  };
  const dismiss = async () => {
    if (!selected || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    const id = selected.id;
    try { const result = await dismissWebsiteRequest(id); if (activeId.current !== id) return; setSelected(null); if (result.state === 'confirmed') toast.show({ text: copy.concurrentConfirmed }); await list.reload(); }
    catch (error) { if (activeId.current === id) toast.show({ text: error instanceof Error && error.message ? error.message : copy.saveFailed }); }
    finally { submitLock.current = false; setSubmitting(false); }
  };
  const complete = isValidDeliveryAddress(address);
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneComplete = (phoneDigits.length === 10 && phoneDigits[0] !== '0') || (phoneDigits.length >= 11 && phoneDigits.length <= 15 && phoneDigits[0] !== '0');
  const missingRpc = list.error?.kind === 'missing';

  return <div className="adm-page adm-requests">
    <h1 className="adm-title">{copy.title}</h1>
      <p className="adm-muted">{copy.hint}</p>
    <label className="adm-request-field">{copy.search}<input className="adm-input" value={search} onChange={(e) => { setSearch(e.target.value); setPages([]); }} /></label>
    <div className="adm-requests__filters" role="group" aria-label={copy.filterLabel}>
      {(['pending', 'dismissed'] as const).map((s) => <button key={s} type="button" aria-pressed={state === s} className={state === s ? 'is-active' : ''} onClick={() => setState(s)}>{copy.states[s]}</button>)}
    </div>
    {list.error ? (list.error.kind === 'missing' ? <p className="adm-muted">{copy.notAvailable}</p> : <LoadError onRetry={() => void list.reload()} />) : list.loading && !list.data ? <Skeleton /> :
      list.data?.requests.length ? <><div className="adm-requests__grid">{list.data.requests.map((r) => <RequestCard key={r.id} request={r} open={() => void open(r)} />)}</div>{list.data.next_before && <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setPages((prior) => [...prior, { before: list.data!.next_before!, before_id: list.data!.next_before_id ?? undefined }])}>{copy.loadMore}</button>}</> : <p className="adm-card adm-muted">{copy.empty[state]}</p>}

    <AdminSheet isOpen={!!selected} canClose={() => !submitting && (!dirty || window.confirm(copy.discardEdits))} onClose={() => { generation.current++; activeId.current = null; setSelected(null); setConfirming(false); baseline.current = null; }} title={selected ? copy.detailTitle(selected.name || copy.nameMissing) : ''} closeLabel={adminCopy.close} width={520}
      bar={selected?.state === 'pending' && !confirming ? <div className="adm-request-actions"><button type="button" className="adm-btn adm-btn--quiet" disabled={submitting || detailLoading || detailError || missingRpc} onClick={() => void dismiss()}><X size={18} aria-hidden="true" />{copy.dismiss}</button><button ref={confirmButton} type="button" className="adm-btn adm-btn--primary" disabled={submitting || detailLoading || !complete || !phoneComplete || detailError || missingRpc} onClick={() => { setConfirming(true); requestAnimationFrame(() => confirmTitle.current?.focus()); }}><Check size={18} aria-hidden="true" />{copy.confirm}</button></div> : undefined}>
      {selected && <div className="adm-stack">
        {detailError && <LoadError onRetry={() => void open(selected)} />}
        {selected.state === 'pending' && <ToastSlot />}
        <p className="adm-muted"><code>{selected.code}</code> · {formatAge(selected.created_at)} · {selected.state === 'pending' ? copy.notConfirmed : selected.state === 'dismissed' ? copy.states.dismissed : copy.confirmed}</p>
        {selected.is_legacy && <p className="adm-request-warning">{copy.legacyIncomplete}</p>}
        {selected.state !== 'pending' && <p className="adm-muted">{selected.state === 'dismissed' ? copy.states.dismissed : copy.confirmed}</p>}
        <h3>{copy.items}</h3><ul>{selected.lines.map((l, i) => <li key={`${l.product_id}-${l.size}-${i}`}>{l.product_id} {l.size} × {l.quantity}</li>)}</ul>
        {selected.coupon_code && <p>{copy.coupon}: {selected.coupon_code}</p>}
        {!selected.delivery_address && selected.pincode && <p><b>{copy.submittedPincode}:</b> {selected.pincode}</p>}
        <fieldset className="adm-request-address" disabled={selected.state !== 'pending' || detailLoading}><legend>{copy.details}</legend>
        <label className="adm-request-field">{copy.name}<input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <label className="adm-request-field">{copy.phone}<input className="adm-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} /></label>
          {(['premises', 'area', 'city', 'state', 'pincode', 'landmark'] as const).map((key) => <label className="adm-request-field" key={key}>{copy.addressFields[key]}{key === 'landmark' && <small>{copy.optional}</small>}
            <input className="adm-input" value={address[key] ?? ''} onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))} maxLength={key === 'pincode' ? 6 : key === 'city' || key === 'state' ? 80 : 160} inputMode={key === 'pincode' ? 'numeric' : undefined} />
          </label>)}
        </fieldset>
        {selected.state === 'pending' && dirty && <button type="button" className="adm-btn adm-btn--quiet" disabled={submitting} onClick={resetDetails}>{copy.resetDetails}</button>}
        {!complete && selected.state === 'pending' && <p className="adm-request-warning">{copy.completeDetails}</p>}
        {confirming && <div className="adm-request-confirm" role="group" aria-labelledby="request-confirm-title">
          <h3 id="request-confirm-title" tabIndex={-1} ref={confirmTitle}>{copy.confirmTitle}</h3><p>{copy.confirmWarning}</p>
          <p>{copy.receivedPrompt}</p>
          <label><input type="checkbox" checked={received} onChange={(e) => setReceived(e.currentTarget.checked)} /> {copy.receivedCheck}</label>
          <button type="button" className="adm-btn adm-btn--primary" disabled={!received || submitting || !complete || !phoneComplete} onClick={() => void confirm()}>{submitting ? copy.saving : copy.confirm}</button>
          <button type="button" className="adm-btn adm-btn--quiet" disabled={submitting} onClick={() => { setConfirming(false); requestAnimationFrame(() => confirmButton.current?.focus()); }}>{copy.cancelConfirm}</button>
        </div>}
      </div>}
    </AdminSheet>
  </div>;
};

export default RequestsPage;
