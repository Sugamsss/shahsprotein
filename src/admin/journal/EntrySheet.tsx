import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Angry, Camera, Frown, Laugh, Meh, Minus, Plus, Smile, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { addJournalPhoto, deleteJournalEntry, getIngredients, removeJournalPhoto, saveJournalEntry, toAdminError } from '../api';
import { formatMoney } from '../format';
import { fromField, toField } from '../ingredients/model';
import { Segmented } from '../parts';
import { useToast } from '../toast';
import type { EntryInput, Ingredient, JournalEntry, Mood } from '../types';
import { useUnsavedWork } from '../unsavedWork';
import { addDays, dayShort } from './model';
import { shrinkPhoto, usePhotoLinks } from './photos';

const copy = adminCopy.journal;
const s = copy.sheet;
const MOOD_ICONS = [Angry, Frown, Meh, Smile, Laugh] as const;
const MAX_PHOTOS = 6;

interface Line { key: string; id?: string; item: string; amount: string; ingredient: string; quantity: string }

let lineKey = 0;
const nextKey = () => `l${++lineKey}`;

const formOf = (entry: JournalEntry | null, ingredients: Ingredient[]) => ({
  mood: entry?.mood ?? null,
  body: entry?.body ?? '',
  hours: entry?.hours ?? null,
  private: entry?.private ?? false,
  tags: entry?.tags ?? [],
  lines: (entry?.purchases ?? []).map((p): Line => {
    const unit = ingredients.find((i) => i.id === p.ingredient_id)?.unit ?? 'g';
    return { key: nextKey(), id: p.id, item: p.item, amount: String(p.amount), ingredient: p.ingredient_id ?? '', quantity: toField(p.quantity, unit) };
  }),
});

type Form = ReturnType<typeof formOf>;

/** What the form will save, or null when a line isn't finished. */
const inputOf = (form: Form, ingredients: Ingredient[]): EntryInput | null => {
  const purchases: EntryInput['purchases'] = [];
  for (const line of form.lines) {
    if (!line.item.trim() && !line.amount.trim()) continue;
    const amount = Number(line.amount.replace(/[₹,\s]/g, ''));
    if (!line.item.trim() || !Number.isInteger(amount) || amount < 0) return null;
    const unit = ingredients.find((i) => i.id === line.ingredient)?.unit ?? 'g';
    const quantity = line.ingredient && line.quantity.trim() ? fromField(line.quantity, unit) : null;
    if (line.ingredient && line.quantity.trim() && quantity === null) return null;
    purchases.push({ id: line.id, item: line.item.trim(), amount, ingredient_id: line.ingredient || null, quantity });
  }
  return { mood: form.mood, body: form.body, hours: form.hours, private: form.private, tags: form.tags, purchases };
};

/**
 * Write or change your entry for a day: how it went, the words, photos, hours, what you
 * bought (optionally an ingredient, which adds to the kitchen), tags, and who can read it.
 * A new entry picks Today or Yesterday; if you already wrote that day, it opens that one.
 * Photos need the entry to exist, so the first photo saves it first.
 */
export const EntrySheet: React.FC<{
  /** The entry being changed, or null for a new one. */
  entry: JournalEntry | null;
  today: string;
  /** Your own entries the page knows, by day: a new entry for a day you already wrote opens that one. */
  mine: Record<string, JournalEntry>;
  otherName: string;
  knownTags: string[];
  onSaved: (entry: JournalEntry) => void;
  onDeleted: (entry: JournalEntry) => void;
  onClose: () => void;
}> = ({ entry: start, today, mine, otherName, knownTags, onSaved, onDeleted, onClose }) => {
  const toast = useToast();
  const [entry, setEntry] = useState<JournalEntry | null>(start);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [day, setDay] = useState(start?.day ?? today);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [form, setForm] = useState<Form>(() => formOf(start, []));
  const baseline = useRef(JSON.stringify(formOf(start, [])));
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [newTag, setNewTag] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const isNew = !start;
  // The sheet scrolls; an error at its top would be out of sight.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  // Ingredients, for "What you bought". Quiet: without them the line is just words and rupees.
  useEffect(() => {
    let live = true;
    getIngredients().then((book) => {
      if (!live) return;
      setIngredients(book.ingredients);
      // Quantities read in each ingredient's unit (kg or pieces) once the list is in, if nothing's typed yet.
      setForm((current) => {
        if (JSON.stringify(current) !== baseline.current) return current;
        const fresh = formOf(entryRef.current, book.ingredients);
        baseline.current = JSON.stringify(fresh);
        return fresh;
      });
    }, () => undefined);
    return () => { live = false; };
  }, []);

  const dirty = JSON.stringify(form) !== baseline.current;
  useUnsavedWork(() => dirty || busy || photoBusy);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setLine = (key: string, change: Partial<Line>) =>
    set('lines', form.lines.map((l) => (l.key === key ? { ...l, ...change } : l)));

  // A new entry for a day you already wrote opens that entry instead of writing over it.
  const pickDay = (next: string) => {
    setDay(next);
    if (!isNew) return;
    const existing = mine[next] ?? null;
    setEntry(existing);
    const fresh = formOf(existing, ingredients);
    setForm(fresh);
    baseline.current = JSON.stringify(fresh);
  };

  const input = inputOf(form, ingredients);
  const empty = form.mood === null && !form.body.trim() && form.hours === null && !form.lines.some((l) => l.item.trim())
    && !(entry?.photos.length);
  const spent = form.lines.reduce((sum, l) => sum + (Number(l.amount.replace(/[₹,\s]/g, '')) || 0), 0);

  const persist = async (): Promise<JournalEntry | null> => {
    if (!input) { setError(s.boughtIncomplete); return null; }
    setError('');
    const saved = await saveJournalEntry(day, input);
    setEntry(saved);
    const fresh = formOf(saved, ingredients);
    setForm(fresh);
    baseline.current = JSON.stringify(fresh);
    onSaved(saved);
    return saved;
  };

  const save = async () => {
    if (busy) return;
    if (empty) { setError(s.empty); return; }
    setBusy(true);
    try {
      if (await persist()) {
        toast.show({ text: s.saved });
        onClose();
      }
    } catch (err) {
      setError(toAdminError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || photoBusy) return;
    setPhotoBusy(true);
    setError('');
    try {
      let current = entry;
      if (!current || dirty) current = await persist();
      if (!current) return;
      for (const file of Array.from(files).slice(0, MAX_PHOTOS - current.photos.length)) {
        const small = await shrinkPhoto(file);
        current = await addJournalPhoto(current.id, small);
        setEntry(current);
        onSaved(current);
      }
    } catch (err) {
      const e = toAdminError(err);
      setError(e.kind === 'message' ? e.message : s.photoFailed);
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePhoto = async (id: string) => {
    try {
      const next = await removeJournalPhoto(id);
      setEntry(next);
      onSaved(next);
    } catch (err) {
      setError(toAdminError(err).message);
    }
  };

  const remove = async () => {
    if (!entry || !window.confirm(s.deleteConfirm)) return;
    setBusy(true);
    try {
      await deleteJournalEntry(entry.id);
      toast.show({ text: s.deleted });
      onDeleted(entry);
      onClose();
    } catch (err) {
      setError(toAdminError(err).message);
      setBusy(false);
    }
  };

  const toggleTag = (tag: string) =>
    set('tags', form.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
      ? form.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...form.tags, tag]);
  const addTag = () => {
    const tag = newTag.trim().slice(0, 24);
    if (tag && !form.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) set('tags', [...form.tags, tag]);
    setNewTag('');
  };
  const tagChoices = useMemo(() => {
    const all = [...s.suggestedTags, ...knownTags, ...form.tags];
    const seen = new Set<string>();
    return all.filter((t) => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true)));
  }, [knownTags, form.tags]);

  const links = usePhotoLinks((entry?.photos ?? []).map((p) => p.path));
  const title = isNew && day === today ? s.titleNew : s.titleDay(dayShort(day, today));

  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={title}
      closeLabel={adminCopy.close}
      canClose={() => !busy && !photoBusy && (!dirty || window.confirm(s.unsaved))}
      bar={<button type="button" className="adm-btn adm-btn--primary adm-btn--block" disabled={busy || photoBusy} onClick={() => void save()}>{busy ? s.saving : s.save}</button>}
    >
      <div className="adm-form adm-jsheet">
        {error && <p ref={errorRef} className="adm-form__error" role="alert">{error}</p>}

        {isNew && (
          <Segmented label={s.dayLabel} slide value={day === today ? 'today' : 'yesterday'}
            options={[{ value: 'today', label: s.days.today }, { value: 'yesterday', label: s.days.yesterday }]}
            onChange={(v) => pickDay(v === 'today' ? today : addDays(today, -1))} />
        )}

        <fieldset className="adm-jmoods">
          <legend className="adm-field__label">{copy.moodLabel}</legend>
          {copy.moods.map((label, i) => {
            const Icon = MOOD_ICONS[i];
            const value = (i + 1) as Mood;
            const on = form.mood === value;
            return (
              <button key={label} type="button" className={`adm-jmood${on ? ' is-on' : ''}`} aria-pressed={on}
                onClick={() => set('mood', on ? null : value)}>
                <Icon size={24} strokeWidth={1.75} aria-hidden="true" />{label}
              </button>
            );
          })}
        </fieldset>

        <div className="adm-field">
          <label className="adm-field__label" htmlFor="adm-jbody">{s.body}</label>
          <textarea id="adm-jbody" className="adm-input adm-jsheet__body" rows={6} maxLength={5000} placeholder={s.bodyPlaceholder}
            value={form.body} onChange={(e) => set('body', e.target.value)} aria-describedby="adm-jbody-hint" />
          <span id="adm-jbody-hint" className="adm-field__hint">{s.bodyHint}</span>
        </div>

        <div className="adm-field">
          <span className="adm-field__label">{s.photos}</span>
          <div className="adm-jsheet__photos">
            {(entry?.photos ?? []).map((photo) => (
              <span key={photo.id} className="adm-jsheet__photo">
                {links[photo.path] ? <img src={links[photo.path]} alt="" /> : <span className="adm-jphoto__wait" />}
                <button type="button" className="adm-jsheet__unphoto" aria-label={s.removePhoto} onClick={() => void removePhoto(photo.id)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
            {(entry?.photos.length ?? 0) < MAX_PHOTOS && (
              <label className={`adm-btn adm-btn--quiet adm-btn--sm adm-jsheet__add${photoBusy ? ' is-busy' : ''}`}>
                <Camera size={18} strokeWidth={1.75} aria-hidden="true" />
                {photoBusy ? s.photoBusy : s.addPhoto}
                <input ref={fileInput} type="file" accept="image/*" multiple className="visually-hidden"
                  disabled={photoBusy} onChange={(e) => void addPhotos(e.target.files)} />
              </label>
            )}
          </div>
          <span className="adm-field__hint">{s.photosMax}</span>
        </div>

        <div className="adm-field">
          <span className="adm-field__label" id="adm-jhours">{s.hours}</span>
          <div className="adm-jhours" role="group" aria-labelledby="adm-jhours">
            <button type="button" className="adm-jround" aria-label={s.hoursLess} disabled={form.hours === null}
              onClick={() => set('hours', form.hours === null || form.hours <= 0 ? null : form.hours - 0.5)}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <b aria-live="polite">{form.hours === null ? s.hoursNone : copy.hours(form.hours)}</b>
            <button type="button" className="adm-jround" aria-label={s.hoursMore} disabled={form.hours === 24}
              onClick={() => set('hours', form.hours === null ? 1 : Math.min(24, form.hours + 0.5))}>
              <Plus size={18} aria-hidden="true" />
            </button>
            <span className="adm-field__hint">{s.hoursHint}</span>
          </div>
        </div>

        <div className="adm-field">
          <span className="adm-field__label">
            {s.bought}{spent > 0 && <small>{s.boughtTotal(formatMoney(spent))}</small>}
          </span>
          {form.lines.map((line) => {
            const unit = ingredients.find((i) => i.id === line.ingredient)?.unit ?? 'g';
            return (
              <div key={line.key} className="adm-jline">
                <input className="adm-input" aria-label={s.boughtItem} placeholder={s.boughtItemPlaceholder} maxLength={80}
                  value={line.item} onChange={(e) => setLine(line.key, { item: e.target.value })} />
                <span className="adm-jline__money">
                  <span aria-hidden="true">₹</span>
                  <input className="adm-input" aria-label={s.boughtAmount} inputMode="numeric" value={line.amount}
                    onChange={(e) => setLine(line.key, { amount: e.target.value.replace(/[^\d]/g, '') })} />
                </span>
                <button type="button" className="adm-jround" aria-label={s.boughtRemove}
                  onClick={() => set('lines', form.lines.filter((l) => l.key !== line.key))}>
                  <X size={16} aria-hidden="true" />
                </button>
                {ingredients.length > 0 && (
                  <div className="adm-jline__ing">
                    <select className="adm-input" aria-label={s.boughtIngredient} value={line.ingredient}
                      onChange={(e) => setLine(line.key, { ingredient: e.target.value, quantity: e.target.value ? line.quantity : '' })}>
                      <option value="">{s.boughtNoIngredient}</option>
                      {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    {line.ingredient && (
                      <input className="adm-input" aria-label={s.boughtQuantity(unit)} placeholder={s.boughtQuantity(unit)}
                        inputMode="decimal" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="adm-text-btn"
            onClick={() => set('lines', [...form.lines, { key: nextKey(), item: '', amount: '', ingredient: '', quantity: '' }])}>
            <Plus size={18} aria-hidden="true" />{s.boughtAdd}
          </button>
          <span className="adm-field__hint">{s.boughtHint}</span>
        </div>

        <div className="adm-field">
          <span className="adm-field__label">{s.tags}</span>
          <div className="adm-jtags adm-jtags--pick">
            {tagChoices.map((tag) => {
              const on = form.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
              return (
                <button key={tag} type="button" className={`adm-jtag${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleTag(tag)}>{tag}</button>
              );
            })}
          </div>
          <div className="adm-jnewtag">
            <input className="adm-input" aria-label={s.tagAdd} placeholder={s.tagPlaceholder} maxLength={24} value={newTag}
              onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
            <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" disabled={!newTag.trim()} onClick={addTag}>{s.tagAdd}</button>
          </div>
        </div>

        <div className="adm-field">
          <Segmented label={s.who} value={form.private ? 'me' : 'both'}
            options={[{ value: 'both', label: s.both }, { value: 'me', label: s.onlyMe }]}
            onChange={(v) => set('private', v === 'me')} />
          <span className="adm-field__hint">{form.private ? s.whoMe(otherName) : s.whoBoth(otherName)}</span>
        </div>

        {entry && (
          <button type="button" className="adm-text-btn adm-jdelete" disabled={busy} onClick={() => void remove()}>{s.delete}</button>
        )}
      </div>
    </AdminSheet>
  );
};
