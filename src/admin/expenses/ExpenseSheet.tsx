import React, { useId, useRef, useState } from 'react';
import { CalendarDays, Clock, Trash2 } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { deleteExpense, saveExpense, toAdminError } from '../api';
import { Field } from '../parts';
import { useToast } from '../toast';
import type { Expense } from '../types';
import { useUnsavedWork } from '../unsavedWork';
import { useUndoable } from '../useUndoable';
import { Calendar } from './Calendar';
import {
  amountError, dayError, dayFieldLabel, istNowTime, noteError, timeError, timeOfDay12, titleError,
} from './model';
import { PickerSheet } from './PickerSheet';
import { TimePicker } from './TimePicker';

const copy = adminCopy.expenses;

type Picker = 'date' | 'time';

/**
 * Add an expense, or change one. Amount first (it's what you have in hand), then the
 * title and the day and time, then a note. Delete is a quiet red line at the foot,
 * soft, with Undo. The day and time come from the admin's own pickers, never the
 * phone's: an expense can't be dated ahead, and its time can't be later than now.
 */
export const ExpenseSheet: React.FC<{
  expense: Expense | null;
  today: string;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
}> = ({ expense, today, onSaved, onDeleted, onClose }) => {
  const toast = useToast();
  const run = useUndoable();
  const formId = useId();
  const dateNoteId = useId();
  const timeNoteId = useId();
  const editing = Boolean(expense);

  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [title, setTitle] = useState(expense?.title ?? '');
  const [day, setDay] = useState(expense?.spent_on ?? today);
  const [time, setTime] = useState(expense?.spent_at ?? istNowTime());
  const [note, setNote] = useState(expense?.note ?? '');
  const [errors, setErrors] = useState<{ amount?: string; title?: string; note?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);

  const amountField = useRef<HTMLInputElement>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const dateButton = useRef<HTMLButtonElement>(null);
  const timeButton = useRef<HTMLButtonElement>(null);
  const pickerFocus = useRef<HTMLElement | null>(null);
  const closePicker = useRef<() => void>(() => undefined);

  // The clock is read again on every render: a time in the future is caught on save too.
  const now = istNowTime();
  const dayMessage = dayError(day, today);
  const timeMessage = timeError(time, day, today, now);

  const state = JSON.stringify({ amount, title, day, time, note });
  const baseline = useRef('');
  if (!baseline.current) baseline.current = state;
  const dirty = state !== baseline.current;
  useUnsavedWork(() => dirty || busy);

  const focusFirst = (messages: { amount?: string | null; title?: string | null; note?: string | null }): void => {
    if (messages.amount) amountField.current?.focus();
    else if (messages.title) titleField.current?.focus();
    else if (messages.note) noteField.current?.focus();
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const next = { amount: amountError(amount) ?? undefined, title: titleError(title) ?? undefined, note: noteError(note) ?? undefined };
    setErrors(next);
    if (next.amount || next.title || next.note) { focusFirst(next); return; }
    if (dayMessage) { dateButton.current?.focus(); return; }
    if (timeMessage) { timeButton.current?.focus(); return; }
    setBusy(true);
    setFormError('');
    try {
      await saveExpense({
        spent_on: day,
        spent_at: time,
        title: title.trim(),
        note: note.trim(),
        amount: Number(amount),
      }, expense?.id);
      baseline.current = state;
      onSaved();
      toast.show({ text: editing ? copy.saved : copy.added });
      onClose();
    } catch (err) {
      setFormError(toAdminError(err).message);
      setBusy(false);
    }
  };

  const remove = () => {
    if (!expense) return;
    const hide = (deleted: boolean, quiet = false): void => void run({
      apply: () => () => undefined,
      save: async () => { await deleteExpense(expense.id, deleted); if (deleted) onDeleted(); else onSaved(); },
      text: copy.deleted,
      undo: () => hide(false, true),
      quiet,
    });
    baseline.current = state;
    hide(true);
    onClose();
  };

  const pickDate = (next: string) => {
    // The time error clears itself: a day before today is never in the future.
    setDay(next);
    closePicker.current();
  };

  return (
    <>
      <AdminSheet
        isOpen
        onClose={onClose}
        title={editing ? copy.editTitle : copy.addTitle}
        closeLabel={adminCopy.close}
        initialFocus={amountField}
        canClose={() => !busy && (!dirty || window.confirm(adminCopy.journal.sheet.unsaved))}
        bar={<button type="submit" form={formId} className="adm-btn adm-btn--primary adm-btn--block" disabled={busy}>
          {busy ? copy.saving : editing ? copy.saveEdit : copy.save}
        </button>}
      >
        <form id={formId} className="adm-form" noValidate onSubmit={(event) => void submit(event)}>
          {formError && <p className="adm-form__error" role="alert">{formError}</p>}
          <Field label={copy.amount} prefix="₹" className="adm-field--amount" error={errors.amount ?? null} hint={copy.amountHint}>
            <input ref={amountField} className="adm-input" inputMode="numeric" autoComplete="off" placeholder={copy.amountPlaceholder}
              value={amount} onChange={(event) => {
                setAmount(event.target.value.replace(/[^0-9]/g, '').slice(0, 10));
                if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
              }} />
          </Field>

          <Field label={copy.titleLabel} error={errors.title ?? null}>
            <input ref={titleField} className="adm-input" autoComplete="off" placeholder={copy.titlePlaceholder} maxLength={200}
              value={title} onChange={(event) => {
                setTitle(event.target.value);
                if (errors.title) setErrors((current) => ({ ...current, title: undefined }));
              }} />
          </Field>

          <div className="adm-form__pair">
            <div className="adm-field">
              <label htmlFor={`${formId}-date`} className="adm-field__label">{copy.date}</label>
              <div className="adm-field__control">
                <button id={`${formId}-date`} ref={dateButton} type="button" className="adm-input adm-picker-btn"
                  aria-haspopup="dialog" aria-expanded={picker === 'date'} aria-describedby={dayMessage ? dateNoteId : undefined}
                  aria-invalid={dayMessage ? true : undefined} onClick={() => setPicker('date')}>
                  <span>{dayFieldLabel(day, today)}</span>
                  <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              {dayMessage && <span id={dateNoteId} className="adm-field__error">{dayMessage}</span>}
            </div>

            <div className="adm-field">
              <label htmlFor={`${formId}-time`} className="adm-field__label">{copy.time}</label>
              <div className="adm-field__control">
                <button id={`${formId}-time`} ref={timeButton} type="button" className="adm-input adm-picker-btn"
                  aria-haspopup="dialog" aria-expanded={picker === 'time'} aria-describedby={timeMessage ? timeNoteId : undefined}
                  aria-invalid={timeMessage ? true : undefined} onClick={() => setPicker('time')}>
                  <span>{timeOfDay12(time)}</span>
                  <Clock size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              {timeMessage && <span id={timeNoteId} className="adm-field__error">{timeMessage}</span>}
            </div>
          </div>

          <Field label={copy.note} optional={copy.optional} error={errors.note ?? null}>
            <textarea ref={noteField} className="adm-input" placeholder={copy.notePlaceholder} maxLength={4000}
              value={note} onChange={(event) => {
                setNote(event.target.value);
                if (errors.note) setErrors((current) => ({ ...current, note: undefined }));
              }} />
          </Field>

          {editing && (
            <div className="adm-exp__delete">
              <button type="button" className="adm-text-btn adm-text-btn--danger" onClick={remove}>
                <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />{copy.delete}
              </button>
              <p className="adm-field__hint">{copy.deleteHint}</p>
            </div>
          )}
        </form>
      </AdminSheet>

      {picker === 'date' && (
        <PickerSheet
          title={copy.pickDate}
          kind="date"
          anchor={dateButton.current}
          initialFocus={pickerFocus}
          closeRef={closePicker}
          onClose={() => setPicker(null)}
          bar={<button type="button" className="adm-btn adm-btn--quiet" onClick={() => pickDate(today)}>{copy.todayButton}</button>}
        >
          <Calendar value={day} today={today} onChange={pickDate} initialFocus={pickerFocus} />
        </PickerSheet>
      )}

      {picker === 'time' && (
        <PickerSheet
          title={copy.pickTime}
          kind="time"
          anchor={timeButton.current}
          initialFocus={pickerFocus}
          closeRef={closePicker}
          onClose={() => setPicker(null)}
          bar={<>
            <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setTime(istNowTime())}>{copy.nowButton}</button>
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => closePicker.current()}>{copy.doneButton}</button>
          </>}
        >
          <TimePicker value={time} onChange={setTime} initialFocus={pickerFocus} />
        </PickerSheet>
      )}
    </>
  );
};
