import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminError, createCoupon, getCoupons, setCouponActive, updateCoupon } from '../api';
import { endOfDayIst, formatDay, formatDayInSentence, istDateValue } from '../format';
import { Field, LoadError, Segmented, SheetForm, Skeleton } from '../parts';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import { hasKinds } from '../orders/quote';
import type { Coupon, CouponKind } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';

const copy = adminCopy.coupons;
const CODE = /^[A-Z0-9-]{3,24}$/;
const KINDS = (['one_time', 'repeat'] as const).map((value) => ({ value, label: copy.kinds[value] }));

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
  // The kind leads, quietly. The old admin's minimum note, if any, shows beside the private note.
  const notes = [coupon.kind && copy.kinds[coupon.kind], ends, coupon.minimum_note, coupon.internal_note].filter(Boolean).join(' · ');
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

/**
 * New coupon (no `coupon`) or edit. Server messages show as they come. `kinds`: the database has
 * coupon kinds (20260928000002); without them there's no choice and none is sent.
 */
const CouponSheet: React.FC<{ coupon: Coupon | null; kinds: boolean; onClose: () => void; onSaved: () => void }> = ({
  coupon, kinds, onClose, onSaved,
}) => {
  const [code, setCode] = useState(coupon?.code ?? '');
  const [gives, setGives] = useState(coupon?.description ?? '');
  const [ends, setEnds] = useState(coupon?.expires_at ? istDateValue(coupon.expires_at) : '');
  const [note, setNote] = useState(coupon?.internal_note ?? '');
  // New coupons start One-time, like the database's default: nothing fills in unless they choose to.
  const [kind, setKind] = useState<CouponKind>(coupon?.kind ?? 'one_time');
  const [problem, setProblem] = useState<{ field: 'code' | 'gives'; text: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const givesRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!coupon && !CODE.test(code)) {
      setProblem({ field: 'code', text: copy.codeInvalid });
      return codeRef.current?.focus();
    }
    if (!gives.trim()) {
      setProblem({ field: 'gives', text: copy.givesMissing });
      return givesRef.current?.focus();
    }
    setProblem(null);
    const fields = {
      description: gives.trim(),
      expires_at: ends ? endOfDayIst(ends) : null,
      minimum_note: coupon?.minimum_note ?? null, // kept as it was
      internal_note: note.trim() || null,
      ...(kinds && { kind }),
    };
    if (coupon) await updateCoupon(coupon.id, coupon.active, fields);
    else {
      // With no coupons yet, kinds can't be told from the list, so the choice shows; an older
      // database answers 'missing' to the kind, and the coupon is made without it (One-time there).
      await createCoupon(code, fields).catch((error: unknown) => {
        if (!(error instanceof AdminError && error.kind === 'missing' && fields.kind)) throw error;
        return createCoupon(code, { ...fields, kind: undefined });
      });
    }
    onSaved();
  };

  const errorFor = (field: 'code' | 'gives') => (problem?.field === field ? problem.text : null);

  return (
    <SheetForm
      title={coupon ? copy.sheetEdit : copy.sheetNew}
      submitLabel={copy.save}
      busyLabel={copy.saving}
      onClose={onClose}
      onSubmit={save}
      initialFocus={coupon ? givesRef : codeRef}
    >
      <Field label={copy.code} hint={copy.codeHint} error={errorFor('code')}>
        <input
          ref={codeRef}
          className="adm-input adm-input--mono"
          value={code}
          readOnly={coupon !== null}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ''))}
        />
      </Field>
      <Field label={copy.gives} hint={copy.givesHint} error={errorFor('gives')}>
        <input ref={givesRef} className="adm-input" value={gives} maxLength={120} onChange={(event) => setGives(event.target.value)} />
      </Field>
      {kinds && (
        <div className="adm-field">
          {/* The legend inside names the choice for screen readers; this is the label people see. */}
          <span className="adm-field__label" aria-hidden="true">{copy.kind}</span>
          <Segmented label={copy.kind} options={KINDS} value={kind} onChange={setKind} />
          <span className="adm-field__hint">{copy.kindHints[kind]}</span>
        </div>
      )}
      <div className="adm-form__pair">
        <Field label={copy.endsOn} optional={copy.optional}>
          <input className="adm-input" type="date" value={ends} min={istDateValue()} onChange={(event) => setEnds(event.target.value)} />
        </Field>
        <Field label={copy.note} optional={copy.noteOnlyYou}>
          <input className="adm-input" value={note} placeholder={copy.notePlaceholder} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </SheetForm>
  );
};

const CouponsPage: React.FC = () => {
  const { data: coupons, error, loading, reload, setData } = useRpc(getCoupons, []);
  const toast = useToast();
  const navigate = useNavigate();
  const run = useUndoable();
  // The sheet: null is closed; `coupon` null is a new one. `key` gives each opening fresh fields.
  const [sheet, setSheet] = useState<{ coupon: Coupon | null; key: number } | null>(null);
  const couponsRef = useRef(coupons);
  couponsRef.current = coupons;
  const show = (list: Coupon[]) => { couponsRef.current = list; setData(list); };

  const setActive = (coupon: Coupon, active: boolean, quiet = false) => {
    void run({
      apply: () => {
        const before = couponsRef.current ?? [];
        show(before.map((c) => (c.id === coupon.id ? { ...c, active } : c)));
        return () => show(before);
      },
      save: () => setCouponActive(coupon.id, active),
      text: active ? copy.turnedOn(coupon.code) : copy.turnedOff(coupon.code),
      undo: () => setActive(coupon, !active, true),
      quiet,
    });
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
          kinds={hasKinds(coupons) || coupons?.length === 0}
          onClose={() => setSheet(null)}
          onSaved={() => {
            // A new coupon's prices are set per product, on Products.
            const isNew = !sheet.coupon;
            setSheet(null);
            toast.show(isNew
              ? { text: copy.savedNew, action: { label: copy.toProducts, onAction: () => navigate('/admin/products') } }
              : { text: copy.saved });
            void reload();
          }}
        />
      )}
    </div>
  );
};

export default CouponsPage;
