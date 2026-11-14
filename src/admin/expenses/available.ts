import { useEffect, useState } from 'react';
import type { ExpenseVendor } from '../types';
import { getExpenseVendors, getExpenses, toAdminError } from '../api';

// Expenses ship before their migration (20261114000000), and vendors before theirs
// (20261114000001). More's link and the page wait for one call to answer, and stay
// hidden when the answer is 'missing'. Asked once per page session; any other
// failure still counts as there, so the screen can show its own error and Retry.
let answer: boolean | null = null;
let asking: Promise<boolean> | null = null;

const ask = (): Promise<boolean> => {
  asking ??= getExpenses().then(
    () => { answer = true; return true; },
    (err: unknown) => {
      if (toAdminError(err).kind === 'missing') {
        answer = false;
        return false;
      }
      asking = null;
      return true;
    },
  );
  return asking;
};

/** False until expenses are known to be on this database, and for good when they aren't. */
export const useExpensesAvailable = (): boolean => {
  const [on, setOn] = useState(answer === true);
  useEffect(() => {
    if (answer !== null) {
      setOn(answer);
      return;
    }
    let live = true;
    void ask().then((value) => { if (live) setOn(value); });
    return () => { live = false; };
  }, []);
  return on;
};

/** Where vendors are known on this database: true once an answer arrived, false once one said 'missing', null until then. */
let vendorsOn: boolean | null = null;

/**
 * The vendors used before, for the sheet's suggestions (asked on every open, because
 * a save adds one). `show` is the Vendor field: it is there from the first paint, so
 * opening the sheet never jumps a row when the answer lands (the box is just empty
 * until then), and only a database that answers 'missing' takes it away. `ready` says
 * whether a vendor may be sent. A read that arrived proves the column is there; a
 * failure that isn't 'missing' proves nothing. So Save stays held in that case unless
 * an earlier read this session already proved it, and an older save is never handed a
 * vendor it would drop.
 */
export const useExpenseVendors = (): { vendors: ExpenseVendor[]; show: boolean; ready: boolean } => {
  const [vendors, setVendors] = useState<ExpenseVendor[]>([]);
  const [show, setShow] = useState(vendorsOn !== false);
  const [ready, setReady] = useState(vendorsOn !== null);

  useEffect(() => {
    if (vendorsOn === false) { setReady(true); return; }
    let live = true;
    getExpenseVendors().then(
      (list) => {
        vendorsOn = true;
        if (!live) return;
        setReady(true);
        setVendors(list);
        setShow(true);
      },
      (err: unknown) => {
        if (toAdminError(err).kind === 'missing') {
          vendorsOn = false;
          if (!live) return;
          setReady(true);
          setVendors([]);
          setShow(false);
          return;
        }
        if (!live) return;
        // Only an answer that worked says the column exists. A failure only counts
        // when a read earlier this session already said so; otherwise the field keeps
        // what was typed but can't be used, and Save waits with it.
        if (vendorsOn === true) { setShow(true); setReady(true); }
        else { setShow(false); setReady(false); }
      },
    );
    return () => { live = false; };
  }, []);

  return { vendors, show, ready };
};
