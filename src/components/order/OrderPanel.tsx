import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useOrder } from '../../context/OrderContext';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import { firstInStockSize, useStock } from '../../services/stockService';
import { orderUrl, trackOrderChat } from '../../utils/contact';
import type { OrderLine } from '../../types/order';
import { OrderCheckout } from './OrderCheckout';
import { OrderEmpty } from './OrderEmpty';
import { OrderLineRow, OrderUndoRow, type LineFlash } from './OrderLineRow';
import { OrderSent } from './OrderSent';
import { OrderShelf } from './OrderShelf';
import { lineKey } from './orderLineKey';

const copy = siteConfig.order;

const UNDO_MS = 6000;
const MERGE_NOTE_MS = 4000;
const LEAVE_MS = 150;
const ANNOUNCE_DELAY_MS = 100;

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const productOf = (productId: string) => productsData.find((p) => p.id === productId);

/** "Muesli, 250 g" for labels and announcements. */
const itemOf = (line: Pick<OrderLine, 'productId' | 'size'>): string =>
  copy.itemName(productOf(line.productId)?.name ?? line.productId, line.size);

// The last add this popup has shown. Module-level, so an add is flashed and
// announced once, even though the popup body mounts afresh on every open.
let shownAddAt = 0;

/** Where focus goes after a change removes the control that had it. */
type FocusTarget =
  | { kind: 'line'; key: string; part: 'size' | 'first' }
  | { kind: 'undo' }
  | { kind: 'sent' }
  | { kind: 'firstPick' };

const findFocusTarget = (root: HTMLElement, target: FocusTarget): HTMLElement | null => {
  switch (target.kind) {
    case 'undo':
      return root.querySelector<HTMLElement>('.order-undo button');
    case 'sent':
      return root.querySelector<HTMLElement>('.order-sent__title');
    case 'firstPick':
      return root.querySelector<HTMLElement>('.order-pick');
    case 'line': {
      const row = Array.from(root.querySelectorAll<HTMLElement>('[data-line-key]'))
        .find((el) => el.dataset.lineKey === target.key);
      if (!row) return null;
      const size = row.querySelector<HTMLElement>('.size-choice input:checked');
      const more = row.querySelector<HTMLElement>('.qty-stepper__btn--more');
      return (target.part === 'size' ? size ?? row.querySelector<HTMLElement>('.qty-stepper__btn') : size ?? more);
    }
  }
};

/** One polite live region. Clearing it first makes a repeated message speak again. */
const useAnnouncer = (): [string, (message: string) => void] => {
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const announce = useCallback((message: string) => {
    clearTimeout(timer.current);
    setText('');
    timer.current = setTimeout(() => setText(message), ANNOUNCE_DELAY_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [text, announce];
};

interface UndoState {
  line: OrderLine;
  /** Where the line sat, so the undo row takes its place. */
  index: number;
  at: number;
  /** Time's up, but focus is on the row: it goes when focus leaves. */
  expired?: boolean;
}

/** The body of "Your order": empty, the order itself, or sent. Loaded on demand. */
export const OrderPanel: React.FC<{ switched?: boolean }> = ({ switched = false }) => {
  const {
    lines, itemCount, maxQuantity, addItem, setQuantity, changeSize, removeItem,
    lastAdd, droppedOnLoad, sent, startNewOrder, sendLines,
  } = useOrder();
  const stock = useStock();

  const rootRef = useRef<HTMLDivElement>(null);
  const [liveText, announce] = useAnnouncer();
  const [flash, setFlash] = useState<{ key: string } & LineFlash | null>(null);
  const [mergeNote, setMergeNote] = useState<{ key: string; text: string; at: number } | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [leavingKey, setLeavingKey] = useState<string | null>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const restoring = useRef(false);

  // Latest lines for handlers that finish after a delay.
  const linesRef = useRef(lines);
  linesRef.current = lines;

  // Every add (a card, the product popup, a tile, a pick, undo) flashes its line and is announced.
  useEffect(() => {
    if (!lastAdd || lastAdd.at <= shownAddAt) return;
    shownAddAt = lastAdd.at;
    const key = lineKey(lastAdd);
    const line = lines.find((l) => lineKey(l) === key);
    const isRestore = restoring.current;
    restoring.current = false;
    if (!isRestore) setUndo(null);
    setFlash({ key, at: lastAdd.at, rise: isRestore || line?.quantity === 1 });
    announce(lastAdd.result === 'capped'
      ? copy.announceAtMax(itemOf(lastAdd))
      : copy.announceAdded(itemOf(lastAdd), itemCount));
  }, [lastAdd, lines, itemCount, announce]);

  // Stock arrived (or changed) while the popup is open and knocked a line out:
  // say so once, politely. Lines that were already out when it opened aren't announced.
  const shownStock = useRef(stock);
  useEffect(() => {
    const before = shownStock.current;
    if (before === stock) return;
    shownStock.current = stock;
    const knockedOut = linesRef.current.filter((line) =>
      stock.isOut(line.productId, line.size) && !before.isOut(line.productId, line.size));
    if (knockedOut.length > 0) announce(knockedOut.map((line) => copy.announceBackSoon(itemOf(line))).join(' '));
  }, [stock, announce]);

  // Sent from here: the Send link is gone, so focus goes to the sent title.
  const hadSent = useRef(sent !== null);
  useEffect(() => {
    if (sent && !hadSent.current) pendingFocus.current = { kind: 'sent' };
    hadSent.current = sent !== null;
  }, [sent]);

  // The undo row stays 6 seconds, or until the next change. If focus is on it
  // then, it waits until focus leaves, so focus never drops to the page.
  useEffect(() => {
    if (!undo || undo.expired) return;
    const timer = setTimeout(() => {
      const row = rootRef.current?.querySelector('.order-undo');
      if (row?.contains(document.activeElement)) setUndo((u) => (u ? { ...u, expired: true } : u));
      else setUndo(null);
    }, UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!mergeNote) return;
    const timer = setTimeout(() => setMergeNote(null), MERGE_NOTE_MS);
    return () => clearTimeout(timer);
  }, [mergeNote]);

  // Last of the effects, so it sees focus queued by the ones above.
  // Move focus once the control it should go to has rendered.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || !rootRef.current) return;
    const element = findFocusTarget(rootRef.current, target);
    if (element) {
      pendingFocus.current = null;
      if (target.kind === 'sent') {
        // A new view: show it from the top (the icon above the title too).
        element.focus({ preventScroll: true });
        const dialog = rootRef.current.closest('.modal-dialog');
        if (dialog) dialog.scrollTop = 0;
      } else {
        element.focus();
      }
    }
  });

  const add = (productId: string, focusLine: boolean) => {
    const product = productOf(productId);
    const size = product && firstInStockSize(product, stock);
    if (!size) return;
    const result = addItem(productId, size);
    if (result !== 'invalid' && focusLine) {
      pendingFocus.current = { kind: 'line', key: lineKey({ productId, size }), part: 'first' };
    }
  };

  const changeQuantity = (line: OrderLine, quantity: number) => {
    setUndo(null);
    setQuantity(line.productId, line.size, quantity);
    announce(quantity >= maxQuantity ? copy.announceAtMax(itemOf(line)) : copy.announceQty(itemOf(line), quantity));
  };

  const finishRemove = (line: OrderLine) => {
    const key = lineKey(line);
    const index = Math.max(0, linesRef.current.findIndex((l) => lineKey(l) === key));
    const wasLast = linesRef.current.length === 1;
    removeItem(line.productId, line.size);
    setLeavingKey(null);
    setUndo({ line, index, at: Date.now() });
    pendingFocus.current = { kind: 'undo' };
    announce(wasLast ? `${copy.announceRemoved(itemOf(line))} ${copy.announceEmpty}` : copy.announceRemoved(itemOf(line)));
  };

  const remove = (line: OrderLine) => {
    if (leavingKey) return;
    setUndo(null);
    if (prefersReducedMotion()) {
      finishRemove(line);
      return;
    }
    setLeavingKey(lineKey(line));
    setTimeout(() => finishRemove(line), LEAVE_MS);
  };

  const changeLineSize = (line: OrderLine, size: string) => {
    setUndo(null);
    const key = lineKey({ productId: line.productId, size });
    const existing = lines.find((l) => lineKey(l) === key);
    changeSize(line.productId, line.size, size);
    // Focus follows the line to its new size (the same row, or the merged one).
    pendingFocus.current = { kind: 'line', key, part: 'size' };
    if (existing) {
      const merged = Math.min(line.quantity + existing.quantity, maxQuantity);
      const product = productOf(line.productId);
      const now = Date.now();
      setFlash({ key, at: now, rise: false });
      setMergeNote({ key, text: copy.mergedNote(`${product?.name ?? ''} ${size}`), at: now });
      announce(copy.announceMerged(itemOf({ productId: line.productId, size }), merged));
    }
  };

  const restore = () => {
    if (!undo) return;
    const { line } = undo;
    setUndo(null);
    restoring.current = true;
    addItem(line.productId, line.size, line.quantity);
    pendingFocus.current = { kind: 'line', key: lineKey(line), part: 'first' };
  };

  const leaveUndo = () => setUndo((u) => (u?.expired ? null : u));

  const newOrder = () => {
    startNewOrder();
    pendingFocus.current = { kind: 'firstPick' };
  };

  const notice = droppedOnLoad > 0 && (
    <p className="order-notice">
      <Info size={16} aria-hidden="true" />
      <span>{copy.droppedNotice}</span>
    </p>
  );

  const undoItem = undo ? itemOf(undo.line) : '';

  let body: React.ReactNode;
  if (sent) {
    body = <OrderSent sent={sent} onNewOrder={newOrder} />;
  } else if (lines.length === 0) {
    body = (
      <>
        {undo && <OrderUndoRow as="div" item={undoItem} onUndo={restore} onLeave={leaveUndo} />}
        {notice}
        <OrderEmpty onAdd={(id) => add(id, true)} />
      </>
    );
  } else {
    // A product's only line is keyed by the product, so changing its size
    // updates the row in place and the size switch slides. With two sizes of
    // one product, each line keeps its own key.
    const soleLine = (line: OrderLine) => lines.filter((l) => l.productId === line.productId).length === 1;
    const rows: React.ReactNode[] = lines.map((line) => {
      const key = lineKey(line);
      const product = productOf(line.productId);
      if (!product) return null;
      // Out: "Back soon" for the product, or for this size when another is in stock.
      const backSoonNote = !stock.isOut(line.productId, line.size)
        ? undefined
        : stock.isProductOut(line.productId) ? copy.lineBackSoon : copy.lineSizeBackSoon(line.size);
      const notes = [
        mergeNote?.key === key ? mergeNote.text : null,
        line.quantity >= maxQuantity ? copy.maxNote : null,
      ].filter((note): note is string => note !== null);
      return (
        <OrderLineRow
          key={soleLine(line) ? line.productId : key}
          line={line}
          product={product}
          maxQuantity={maxQuantity}
          flash={flash?.key === key ? flash : undefined}
          notes={notes}
          leaving={leavingKey === key}
          isSizeOut={(size) => stock.isOut(line.productId, size)}
          backSoonNote={backSoonNote}
          onRemove={() => remove(line)}
          onSize={(size) => changeLineSize(line, size)}
          onLess={() => (line.quantity > 1 ? changeQuantity(line, line.quantity - 1) : remove(line))}
          onMore={() => {
            if (line.quantity < maxQuantity) changeQuantity(line, line.quantity + 1);
          }}
        />
      );
    });
    if (undo) {
      rows.splice(Math.min(undo.index, rows.length), 0, (
        <OrderUndoRow key="undo" item={undoItem} onUndo={restore} onLeave={leaveUndo} />
      ));
    }

    body = (
      <>
        <p className="order-intro">{copy.intro}</p>
        {sendLines.length === 0 && (
          <p className="order-all-out">
            {copy.allBackSoon}{' '}
            <a
              href={orderUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="order-text-link"
              onClick={trackOrderChat}
            >
              {copy.chatLink}
            </a>
          </p>
        )}
        <div className="order-list">
          {notice}
          <h4 className="visually-hidden">{copy.itemsHeading}</h4>
          <ul className="order-lines">{rows}</ul>
        </div>
        <OrderShelf onAdd={(id) => add(id, false)} />
        <OrderCheckout />
      </>
    );
  }

  return (
    <div ref={rootRef} className={`order-panel${switched ? ' order-panel--switched' : ''}`}>
      <p className="visually-hidden order-live" role="status">{liveText}</p>
      {body}
    </div>
  );
};
