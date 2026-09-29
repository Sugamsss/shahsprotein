import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { getOrder } from '../api';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import type { Order } from '../types';
import { ToastSlot } from '../toast';
import { useRpc } from '../useRpc';
import { type WorkLane, laneOf, nextOf } from './model';
import { DetailsCard, History, ItemsCard, OrderHead, OrderMenu, OrderNotes, PrimaryAction, StatusCard } from './OrderParts';
import { PaidSheet } from './PaidMethod';
import { usePriorityGive } from './PriorityGive';
import { useOrderChange } from './useOrderChange';
import { type HowPaid, type PaymentActions, usePayments } from './usePayments';

const copy = adminCopy.order;

/**
 * One order: straight from the board's list when it's there, with the history
 * and phone hint from get_admin_order. A saved change (new updated_at) loads
 * the detail again, so the history stays true.
 */
const useOrder = (code: string, fromList?: Order, putInList?: (o: Order) => void) => {
  const [version, setVersion] = useState('');
  const detail = useRpc(() => getOrder(code), [code, version]);
  const base = fromList ?? detail.data;
  const order = base && { ...base, history: detail.data?.history, phone_suggestion: detail.data?.phone_suggestion ?? null };
  const show = useCallback((o: Order) => {
    putInList?.(o);
    detail.setData((d) => (d && d.id === o.id ? { ...d, ...o } : d));
    setVersion(o.updated_at);
  }, [putInList, detail.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  return { order, show, detail };
};

/** Everything under the head, the same on the phone page and in the popup. */
const OrderBody: React.FC<{
  order: NonNullable<ReturnType<typeof useOrder>['order']>;
  change: ReturnType<typeof useOrderChange>;
  show: (o: Order) => void;
  payments: PaymentActions;
  onPayRest: (o: Order) => void;
  onPriorityOn: (o: Order) => void;
}> = ({ order, change, show, payments, onPayRest, onPriorityOn }) => (
  <>
    <OrderNotes order={order} />
    <StatusCard key={order.id} order={order} change={change} payments={payments} onPayRest={onPayRest} onPriorityOn={onPriorityOn} />
    <div className="adm-od-cols">
      <ItemsCard order={order} />
      <DetailsCard order={order} onSaved={show} />
    </div>
    <History history={order.history} />
  </>
);

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Phone: the order as its own page, with the next step pinned above the tab bar. */
export const OrderPage: React.FC<{ code: string }> = ({ code }) => {
  const navigate = useNavigate();
  // Back to the same board: a product filter or a search stays, and on a phone the stage it came from (#packing).
  const { search, hash } = useLocation();
  const board = `/admin/orders${search}${hash}`;
  const { order, show, detail } = useOrder(code);
  // A priority order can take food from others: after that, load this one again.
  const change = useOrderChange(show, detail.reload);
  const payments = usePayments(show);
  const [paying, setPaying] = useState<Order | null>(null);
  const give = usePriorityGive(detail.reload);

  if (!order) {
    if (detail.error) return <div className="adm-page"><LoadError onRetry={detail.reload} /></div>;
    if (detail.loading) return <div className="adm-page"><Skeleton cards={3} rows={3} /></div>;
  }
  const back = <AdminLink className="adm-back adm-back--start" to={board}><ChevronLeft size={20} aria-hidden="true" />{copy.back}</AdminLink>;
  if (!order) return <div className="adm-page">{back}<p className="adm-muted">{copy.notFound(code)}</p></div>;
  const next = nextOf(order);

  return (
    <div className="adm-page adm-od">
      <div className="adm-od-top">
        {back}
        <OrderMenu order={order} change={change} payments={payments} onDeleted={() => navigate(board, { replace: true })} />
      </div>
      <h1 className="adm-od-head"><OrderHead order={order} /></h1>
      <OrderBody order={order} change={change} show={show} payments={payments} onPayRest={setPaying} onPriorityOn={give.offer} />
      {/* Nothing to do next: no bar. The status card already says "All done." or why. */}
      {next && (
        <div className="adm-od-bar">
          <ToastSlot />
          {/* Mark paid asks how they paid first. */}
          <PrimaryAction order={order} change={change} onNext={next.lane === 'collect' ? () => setPaying(order) : undefined} />
        </div>
      )}
      <PaidSheet order={paying} onClose={() => setPaying(null)} onPick={(o, how) => void payments.payTheRest(o, how)} />
      {give.popup}
    </div>
  );
};

/**
 * Laptop: the order as a centred popup over the frosted board. ‹ › and ← → walk
 * through the board in order, lane into lane; Enter does the next step and P
 * pays the rest (or marks a paid order not paid), both only when focus isn't in a field.
 */
export const OrderPopup: React.FC<{
  code: string;
  /** The board's orders, in board order. */
  sequence: Order[];
  putInList: (o: Order) => void;
  onDeleted: (o: Order) => void;
  onClose: () => void;
  /** The kitchen moved other orders (priority took food, or was given it): load the board again. */
  onKitchen?: () => void;
}> = ({ code, sequence, putInList, onDeleted, onClose, onKitchen }) => {
  const navigate = useNavigate();
  // Moving between orders keeps the board's query, so a filtered board stays filtered behind.
  const { search } = useLocation();
  const fromList = sequence.find((o) => o.code === code);
  const { order, show, detail } = useOrder(code, fromList, putInList);
  const kitchenMoved = () => { detail.reload(); onKitchen?.(); };
  const change = useOrderChange(show, kitchenMoved);
  const give = usePriorityGive(kitchenMoved);
  const payments = usePayments(show);
  const nameRef = useRef<HTMLSpanElement>(null);
  // Mark paid asks how first. From the pinned button (or Enter) it then moves on
  // to the next order, like every next step; from the money block or P it stays.
  const [paying, setPaying] = useState<{ order: Order; moveOn: boolean } | null>(null);

  const at = fromList ? sequence.indexOf(fromList) : -1;
  const go = (step: number) => {
    const to = sequence[at + step];
    if (at >= 0 && to) navigate(`/admin/orders/${to.code}${search}`, { replace: true });
  };
  const lane = order ? laneOf(order) : 'done';
  const inLane = sequence.filter((o) => laneOf(o) === lane);
  const next = order && nextOf(order);

  // Enter (or the main button) does the next step, then moves on to the next
  // order in the lane this one came from, so Packing is Enter, Enter, Enter.
  // The last one left in its lane stays open, showing where it went.
  // Mark paid first asks how they paid (the sheet), then moves on the same way.
  const doNext = (how?: HowPaid) => {
    if (!order || !next || !fromList) return;
    if (next.lane === 'collect' && !how) return setPaying({ order, moveOn: true });
    const i = inLane.indexOf(fromList);
    const then = inLane[i + 1] ?? inLane[i - 1];
    if (how) void payments.payTheRest(order, how);
    else change(order, next.changes);
    if (then) navigate(`/admin/orders/${then.code}${search}`, { replace: true });
  };

  // A deep link can open the popup before the order has loaded, so focus lands
  // on ×. Once the order is there, move it to the name.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !order) return;
    placed.current = true;
    const target = nameRef.current;
    if (target && !isTyping(document.activeElement)) target.focus();
  });

  // Latest values for the key handler, which is set up once.
  const keys = useRef({ go, order, doNext, payments, setPaying });
  keys.current = { go, order, doNext, payments, setPaying };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Only this popup's own keys: not while typing, and not when a sheet sits on top.
      if (!target.closest?.('.adm-od-popup') || isTyping(target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const { go: move, order: o, doNext: step, payments: pay, setPaying: ask } = keys.current;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1); }
      else if (e.key === 'Enter' && !target.closest('button, a, summary') && o) { e.preventDefault(); step(); }
      // P: paid → not paid at once (Undo); not or part paid → pay the rest, focus on UPI.
      // A cancelled order takes no new money, the same as its money block.
      else if (e.key.toLowerCase() === 'p' && o) {
        e.preventDefault();
        if (o.paid) void pay.markNotPaid(o);
        else if (o.status !== 'cancelled') ask({ order: o, moveOn: false });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const title = order ? <OrderHead order={order} nameRef={nameRef} /> : code;
  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={title}
      closeLabel={adminCopy.close}
      width={760}
      className="adm-od-popup"
      initialFocus={nameRef}
      actions={at >= 0 && (
        <>
          {inLane.length > 0 && lane !== 'done' && (
            <span className="adm-od-pos">{copy.position(inLane.indexOf(fromList!) + 1, inLane.length, adminCopy.orderStages.names[lane as WorkLane])}</span>
          )}
          <button type="button" className="adm-iconbtn" aria-label={copy.prev} disabled={at <= 0} onClick={() => go(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button type="button" className="adm-iconbtn" aria-label={copy.nextOrder} disabled={at >= sequence.length - 1} onClick={() => go(1)}><ChevronRight size={20} aria-hidden="true" /></button>
        </>
      )}
      bar={order && (
        <>
          <ToastSlot />
          <OrderMenu order={order} change={change} payments={payments} onDeleted={() => { onDeleted(order); onClose(); }} up />
          <span className="adm-od-keys" aria-hidden="true">
            <span><kbd>Esc</kbd> {copy.keys[0]}</span> <span><kbd>←</kbd><kbd>→</kbd> {copy.keys[1]}</span> <span><kbd>P</kbd> {copy.keys[2]}</span>
          </span>
          <PrimaryAction order={order} change={change} onNext={() => doNext()} />
        </>
      )}
    >
      {!order && (detail.error ? <LoadError onRetry={detail.reload} /> : detail.loading ? <Skeleton cards={2} rows={3} /> : <p>{copy.notFound(code)}</p>)}
      {order && <OrderBody order={order} change={change} show={show} payments={payments}
        onPayRest={(o) => setPaying({ order: o, moveOn: false })} onPriorityOn={give.offer} />}
      {give.popup}
      <PaidSheet order={paying?.order ?? null} onClose={() => setPaying(null)}
        onPick={(o, how) => (paying?.moveOn ? doNext(how) : void payments.payTheRest(o, how))} />
    </AdminSheet>
  );
};
