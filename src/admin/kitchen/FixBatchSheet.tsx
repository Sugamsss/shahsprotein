import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { deleteBatch, toAdminError, updateBatch } from '../api';
import { formatDayInSentence, formatWeight } from '../format';
import { productName } from '../orders/model';
import type { Kitchen, KitchenBatch, KitchenEffects } from '../types';
import { MadeOn } from './MadeOn';
import { nameOf, packedCount } from './model';
import { Outcomes } from './Outcomes';
import { AmountWheel } from './Wheel';

const copy = adminCopy.kitchen;

// Fix a batch (design/side-by-side/06-fix, A): from "Logged this week". Change the
// amount or the day it was made, or delete it, with the same preview sentences as
// Log cooking ("Meera's order goes back to Cooking") before anything happens, and
// an exact Undo after.

const dayOf = (day: string) => formatDayInSentence(`${day}T12:00:00+05:30`);

/** The toast's second sentence: who went to Packing, who went back. */
const movedText = (effects: KitchenEffects) => copy.movedOn(
  packedCount(effects),
  effects.orders.filter((o) => o.to === 'cooking' && o.from !== 'cooking').map((o) => nameOf(o)),
);

const Bar: React.FC<{
  deleting: boolean;
  busy: boolean;
  changed: boolean;
  canSave: boolean;
  onDelete: () => void;
  onKeep: () => void;
  onSave: () => Promise<boolean>;
}> = ({ deleting, busy, changed, canSave, onDelete, onKeep, onSave }) => {
  const close = useDialogClose();
  const save = async () => { if (await onSave()) close(); };
  if (deleting) {
    return (
      <div className="adm-kx-bar__pair">
        <button type="button" className="adm-btn adm-btn--quiet" onClick={onKeep} disabled={busy}>{copy.keepIt}</button>
        <button type="button" className="adm-btn adm-btn--danger" onClick={() => void save()} disabled={busy}>
          {busy ? copy.deleting : copy.deleteIt}
        </button>
      </div>
    );
  }
  return (
    <div className="adm-kx-bar__pair adm-kx-bar__pair--wide">
      <button type="button" className="adm-btn adm-btn--quiet adm-kx-delete" onClick={onDelete} disabled={busy}>
        <Trash2 size={18} aria-hidden="true" />{copy.delete}
      </button>
      <button type="button" className="adm-btn adm-btn--primary" onClick={() => void save()} disabled={busy || !changed || !canSave}>
        {busy ? copy.saving : copy.save}
      </button>
    </div>
  );
};

export const FixBatchSheet: React.FC<{
  batch: KitchenBatch;
  kitchen: Kitchen;
  onClose: () => void;
  onDone: (effects: KitchenEffects, text: string) => void;
}> = ({ batch, kitchen, onClose, onDone }) => {
  const [grams, setGrams] = useState(batch.grams);
  const [madeOn, setMadeOn] = useState(batch.made_on);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = productName(batch.product_id);

  const changes = {
    ...(grams !== batch.grams ? { grams } : {}),
    ...(madeOn !== batch.made_on ? { made_on: madeOn } : {}),
  };
  const changed = Object.keys(changes).length > 0;
  const key = deleting ? 'delete' : JSON.stringify(changes);
  const request = useMemo(() => {
    if (deleting) return { key, load: () => deleteBatch(batch.id, true) };
    if (!changed || grams <= 0) return null;
    return { key, load: () => updateBatch(batch.id, changes, true) };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSave = async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      if (deleting) {
        const effects = await deleteBatch(batch.id);
        onDone(effects, copy.deleted(name, movedText(effects)));
      } else {
        const effects = await updateBatch(batch.id, changes);
        onDone(effects, copy.fixed(name, movedText(effects)));
      }
      return true;
    } catch (err) {
      setError(toAdminError(err).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={copy.fixTitle(name, dayOf(batch.made_on))}
      closeLabel={adminCopy.close}
      className="adm-kx-sheet"
      bar={(
        <Bar
          deleting={deleting}
          busy={busy}
          changed={changed}
          canSave={grams > 0}
          onDelete={() => { setDeleting(true); setError(''); }}
          onKeep={() => setDeleting(false)}
          onSave={onSave}
        />
      )}
    >
      <div className="adm-kx-body">
        {error && <p className="adm-form__error" role="alert">{error}</p>}
        {!deleting && (
          <>
            <MadeOn value={madeOn} today={kitchen.today} onChange={setMadeOn} />
            <div className="adm-kx-howmuch">
              <span className="adm-kx-label">{copy.howMuch}</span>
              <p className="adm-kx-howmuch__value">
                {grams !== batch.grams && <s><span className="visually-hidden">{copy.was(formatWeight(batch.grams))}</span><span aria-hidden="true">{formatWeight(batch.grams)}</span></s>}
                <b>{formatWeight(grams)}</b>
              </p>
              <AmountWheel value={grams} name={name} onChange={setGrams} />
            </div>
          </>
        )}
        {(changed || deleting) && (
          <Outcomes heading={deleting ? copy.ifYouDelete : copy.ifYouSave} before={kitchen} mode="fix" request={request} />
        )}
      </div>
    </AdminSheet>
  );
};
