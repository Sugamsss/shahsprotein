import React, { useRef, useState } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { deleteIngredient, saveIngredient } from '../api';
import { Field, Segmented, SheetForm } from '../parts';
import { useToast } from '../toast';
import type { Ingredient, IngredientBook } from '../types';
import { formatAmount, fromField, toField } from './model';

const copy = adminCopy.ingredients;

/** "How much is there now": from now on, stock starts from this. */
export const CountSheet: React.FC<{
  ingredient: Ingredient;
  onClose: () => void;
  onCount: (amount: number) => Promise<void>;
}> = ({ ingredient, onClose, onCount }) => {
  const [text, setText] = useState(ingredient.stock !== null && ingredient.stock > 0 ? toField(ingredient.stock, ingredient.unit) : '');
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  return (
    <SheetForm title={copy.countTitle(ingredient.name)} submitLabel={copy.countSave} busyLabel={copy.saving} onClose={onClose} initialFocus={field}
      onSubmit={async () => {
        const amount = fromField(text, ingredient.unit);
        if (amount === null) { setError(copy.countField(ingredient.unit)); return; }
        await onCount(amount);
        onClose();
      }}>
      <Field label={copy.countField(ingredient.unit)} hint={copy.countHint} error={error}>
        <input ref={field} className="adm-input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </SheetForm>
  );
};

/**
 * Add an ingredient or change one: its name, food (kg) or packaging (pieces), when it's
 * low, and how much goes into a kilo of each product (Log cooking takes that much away).
 */
export const IngredientSheet: React.FC<{
  ingredient: Ingredient | null;
  products: string[];
  onClose: () => void;
  onSaved: (book: IngredientBook) => void;
}> = ({ ingredient, products, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(ingredient?.name ?? '');
  const [kind, setKind] = useState<Ingredient['kind']>(ingredient?.kind ?? 'food');
  const unit: Ingredient['unit'] = kind === 'packaging' ? 'pieces' : 'g';
  const [low, setLow] = useState(toField(ingredient?.low_at ?? null, ingredient?.unit ?? 'g'));
  const [uses, setUses] = useState<Record<string, string>>(() =>
    Object.fromEntries((ingredient?.uses ?? []).map((u) => [u.product_id, String(Number(u.per_kg))])));
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const listed = productsData.filter((p) => products.includes(p.id));

  const submit = async () => {
    if (!name.trim()) { setError(copy.name); return; }
    const lowAt = low.trim() ? fromField(low, unit) : null;
    if (low.trim() && lowAt === null) { setError(copy.lowAt(unit)); return; }
    const perKg: { product_id: string; per_kg: number }[] = [];
    for (const [productId, value] of Object.entries(uses)) {
      if (!value.trim()) continue;
      const n = Number(value.replace(/,/g, ''));
      if (!Number.isFinite(n) || n <= 0) { setError(copy.uses); return; }
      perKg.push({ product_id: productId, per_kg: n });
    }
    const book = await saveIngredient({ name, kind, low_at: lowAt, uses: perKg }, ingredient?.id);
    onSaved(book);
    toast.show({ text: copy.saved });
    onClose();
  };

  const remove = async () => {
    if (!ingredient || !window.confirm(copy.removeConfirm)) return;
    onSaved(await deleteIngredient(ingredient.id));
    toast.show({ text: copy.removed(ingredient.name) });
    onClose();
  };

  return (
    <SheetForm title={ingredient ? copy.editTitle : copy.addTitle} submitLabel={copy.save} busyLabel={copy.saving}
      onClose={onClose} initialFocus={field} onSubmit={submit}>
      {error && <p className="adm-form__error" role="alert">{error}</p>}
      <Field label={copy.name}>
        <input ref={field} className="adm-input" maxLength={40} placeholder={copy.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="adm-field">
        <Segmented label={copy.kind} value={kind} onChange={(next) => {
          // The low mark keeps its meaning in the new unit only if it's empty.
          if (next !== kind) setLow('');
          setKind(next);
        }}
          options={[{ value: 'food', label: copy.kinds.food }, { value: 'packaging', label: copy.kinds.packaging }]} />
      </div>
      <Field label={copy.lowAt(unit)} hint={copy.lowAtHint}>
        <input className="adm-input" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
      </Field>
      {listed.length > 0 && (
        <fieldset className="adm-ingsheet__uses">
          <legend className="adm-field__label">{copy.uses}</legend>
          <p className="adm-field__hint">{copy.usesHint}</p>
          {listed.map((p) => (
            <Field key={p.id} label={copy.usesField(p.name, unit)}>
              <input className="adm-input" inputMode="decimal" value={uses[p.id] ?? ''}
                onChange={(e) => setUses((u) => ({ ...u, [p.id]: e.target.value }))} />
            </Field>
          ))}
        </fieldset>
      )}
      {ingredient && ingredient.stock !== null && (
        <p className="adm-field__hint">{formatAmount(ingredient.stock, ingredient.unit)}</p>
      )}
      {ingredient && <button type="button" className="adm-text-btn adm-jdelete" onClick={() => void remove()}>{copy.remove}</button>}
    </SheetForm>
  );
};
