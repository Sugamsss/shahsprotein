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

/** Where vendors are known on this database: true, false once it answered 'missing', null while asking. */
let vendorsOn: boolean | null = null;

/**
 * The vendors used before, for the sheet's suggestions (asked on every open, because
 * a save adds one). `show` is the Vendor field: it is there from the first paint, so
 * opening the sheet never jumps a row when the answer lands (the box is just empty
 * until then), and only a database that answers 'missing' takes it away. A failure
 * that isn't 'missing' counts as there — the field works, just without names.
 */
export const useExpenseVendors = (): { vendors: ExpenseVendor[]; show: boolean } => {
  const [vendors, setVendors] = useState<ExpenseVendor[]>([]);
  const [show, setShow] = useState(vendorsOn !== false);

  useEffect(() => {
    if (vendorsOn === false) return;
    let live = true;
    getExpenseVendors().then(
      (list) => {
        vendorsOn = true;
        if (!live) return;
        setVendors(list);
        setShow(true);
      },
      (err: unknown) => {
        if (toAdminError(err).kind === 'missing') {
          vendorsOn = false;
          if (!live) return;
          setVendors([]);
          setShow(false);
          return;
        }
        if (live) setShow(true);
      },
    );
    return () => { live = false; };
  }, []);

  return { vendors, show };
};
