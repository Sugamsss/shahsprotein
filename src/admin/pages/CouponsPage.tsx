import React, { useId, useRef, useState } from 'react';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { createCoupon, getCoupons, setCouponActive, updateCoupon, type AdminError } from '../api';
import { endOfDayIst, formatDay, formatDayInSentence, istDateValue } from '../format';
import { LoadError, Skeleton } from '../parts';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import type { Coupon } from '../types';
import { useRpc } from '../useRpc';

const copy = adminCopy.coupons;
const CODE = /^[A-Z0-9-]{3,24}$/;

// Coupons (spec 2.11). On/off is one tap with Undo; new and edit use a sheet.
// End dates are whole days in India time (saved as the last second of the day).

const hasEnded = (coupon: Coupon) => coupon.expires_at !== null && Date.parse(coupon.expires_at) <= Date.now();

const CouponCard: React.FC<{ coupon: Coupon; onActive: (active: boolean) => void; onEdit: () => void }> = ({
  coupon, onActive, onEdit,
}) => {
  const ended = hasEnded(coupon);
  const live = coupon.active && !ended;
  const count = coupon.order_count ?? 0;
  const ends = coupon.expires_at ? (ended ? copy.endedOn : copy.ends)(formatDay(coupon.expires_at)) : copy.noEnd;
  // The old admin's minimum note, if any, shows beside the private note.
  const notes = [ends, coupon.minimum_note, coupon.internal_note].filter(Boolean).join(' · ');
  return (
    <section className={`adm-card adm-coupon${live ? '' : ' is-off'}`} aria-labelledby={`adm-coupon-${coupon.id}`}>
      <div className="adm-coupon__head">
        <h2 id={`adm-coupon-${coupon.id}`} className="adm-coupon__code">{coupon.code}</h2>
        <span className={`adm-pill${live ? ' adm-pill--on' : ''}`}>{ended ? copy.ended : live ? copy.on : copy.off}</span>
        {!ended && <Switch checked={coupon.active} label={copy.switchLabel(coupon.code)} onChange={onActive} />}
      </div>
      <p className="adm-coupon__gives">{coupon.description}</p>
      <p className="adm-coupon__meta">
        <ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />
        {count > 0 ? copy.used(count, coupon.last_used_at ? formatDayInSentence(coupon.last_used_at) : null) : copy.notUsed}
      </p>
      <p className="adm-coupon__meta">{notes}</p>
      <button type="button" className="adm-text-btn" aria-label={copy.editLabel(coupon.code)} onClick={onEdit}>
        <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
        {copy.edit}
      </button>
    </section>
  );
};

/** New coupon (no `coupon`) or edit. Server messages show as they come. */
const CouponSheet: React.FC<{ coupon: Coupon | null; onClose: () => void; onSaved: () => void }> = ({
  coupon, onClose, onSaved,
}) => {
  const id = useId();
  const [code, setCode] = useState(coupon?.code ?? '');
  const [gives, setGives] = useState(coupon?.description ?? '');
  const [ends, setEnds] = useState(coupon?.expires_at ? istDateValue(coupon.expires_at) : '');
  const [note, setNote] = useState(coupon?.internal_note ?? '');
  const [problem, setProblem] = useState<{ field?: 'code' | 'gives'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const givesRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!coupon && !CODE.test(code)) {
      setProblem({ field: 'code', text: copy.codeInvalid });
      codeRef.current?.focus();
      return;
    }
    if (!gives.trim()) {
      setProblem({ field: 'gives', text: copy.givesMissing });
      givesRef.current?.focus();
      return;
    }
    setSaving(true);
    setProblem(null);
    const fields = {
      description: gives.trim(),
      expires_at: ends ? endOfDayIst(ends) : null,
      minimum_note: coupon?.minimum_note ?? null, // kept as it was
      internal_note: note.trim() || null,
    };
    try {
      if (coupon) await updateCoupon(coupon.id, coupon.active, fields);
      else await createCoupon(code, fields);
      onSaved();
    } catch (error) {
      setProblem({ text: (error as AdminError).message });
      setSaving(false);
    }
  };

  const hint = (field: 'code' | 'gives', text: string) => (
    <span id={`${id}-${field}-hint`} className={problem?.field === field ? 'adm-field__error' : 'adm-field__hint'}>
      {problem?.field === field ? problem.text : text}
    </span>
  );

  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={coupon ? copy.sheetEdit : copy.sheetNew}
      closeLabel={adminCopy.close}
      initialFocus={coupon ? givesRef : codeRef}
      bar={
        <button type="submit" form={`${id}-form`} className="adm-btn adm-btn--primary adm-btn--block" disabled={saving}>
          {saving ? copy.saving : copy.save}
        </button>
      }
    >
      <form id={`${id}-form`} className="adm-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {problem && !problem.field && <p className="adm-form__error" role="alert">{problem.text}</p>}
        <label className="adm-field">
          <span className="adm-field__label">{copy.code}</span>
          <input
            ref={codeRef}
            className="adm-input adm-input--mono"
            value={code}
            readOnly={coupon !== null}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            aria-invalid={problem?.field === 'code' || undefined}
            aria-describedby={`${id}-code-hint`}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ''))}
          />
          {hint('code', copy.codeHint)}
        </label>
        <label className="adm-field">
          <span className="adm-field__label">{copy.gives}</span>
          <input
            ref={givesRef}
            className="adm-input"
            value={gives}
            maxLength={120}
            aria-invalid={problem?.field === 'gives' || undefined}
            aria-describedby={`${id}-gives-hint`}
            onChange={(event) => setGives(event.target.value)}
          />
          {hint('gives', copy.givesHint)}
        </label>
        <div className="adm-form__pair">
          <label className="adm-field">
            <span className="adm-field__label">{copy.endsOn} <small>{copy.optional}</small></span>
            <input className="adm-input" type="date" value={ends} min={istDateValue()} onChange={(event) => setEnds(event.target.value)} />
          </label>
          <label className="adm-field">
            <span className="adm-field__label">{copy.note} <small>{copy.noteOnlyYou}</small></span>
            <input className="adm-input" value={note} placeholder={copy.notePlaceholder} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
      </form>
    </AdminSheet>
  );
};

const CouponsPage: React.FC = () => {
  const { data: coupons, error, loading, reload, setData } = useRpc(getCoupons, []);
  const toast = useToast();
  // The sheet: null is closed; `coupon` null is a new one. `key` gives each opening fresh fields.
  const [sheet, setSheet] = useState<{ coupon: Coupon | null; key: number } | null>(null);
  const couponsRef = useRef(coupons);
  couponsRef.current = coupons;

  const setActive = (coupon: Coupon, active: boolean, withUndo = true) => {
    const before = couponsRef.current ?? [];
    const withActive = (list: Coupon[]) => list.map((c) => (c.id === coupon.id ? { ...c, active } : c));
    couponsRef.current = withActive(before);
    setData(couponsRef.current);
    setCouponActive(coupon.id, active).then(
      () => {
        if (!withUndo) return;
        toast.show({
          text: active ? copy.turnedOn(coupon.code) : copy.turnedOff(coupon.code),
          action: { label: adminCopy.undo, onAction: () => setActive(coupon, !active, false) },
        });
      },
      () => {
        couponsRef.current = before;
        setData(before);
        toast.error(() => setActive(coupon, active, withUndo));
      },
    );
  };

  let body: React.ReactNode;
  if (error && !coupons) body = <LoadError onRetry={() => void reload()} />;
  else if (!coupons) body = loading ? <Skeleton rows={3} /> : null;
  else if (coupons.length === 0) body = <p className="adm-card adm-empty">{copy.empty}</p>;
  else {
    body = (
      <div className="adm-stack">
        {coupons.map((coupon) => (
          <CouponCard
            key={coupon.id}
            coupon={coupon}
            onActive={(active) => setActive(coupon, active)}
            onEdit={() => setSheet({ coupon, key: Date.now() })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="adm-page adm-page--list">
      <div className="adm-title-row">
        <h1 className="adm-title">{copy.title}</h1>
        <button type="button" className="adm-btn adm-btn--tonal adm-btn--sm" onClick={() => setSheet({ coupon: null, key: Date.now() })}>
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.add}
        </button>
      </div>
      <p className="adm-intro">{copy.intro}</p>
      {body}
      {sheet && (
        <CouponSheet
          key={sheet.key}
          coupon={sheet.coupon}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            toast.show({ text: copy.saved });
            void reload();
          }}
        />
      )}
    </div>
  );
};

export default CouponsPage;
