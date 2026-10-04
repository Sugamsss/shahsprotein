import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, IndianRupee, MessageCircle } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { Code } from './OrderCard';
import { formatMoney } from '../format';
import { ToastSlot, useToast } from '../toast';
import type { Order } from '../types';
import { billFilename } from './billPaint';
import { billPng, paintBillScene } from './billScene';
import { billShare, billShareText, buildBill } from './bill';
import type { PriceBook } from './usePriceBook';

export interface BillSheetProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  /** The order view's prices and coupons, already loaded by the time someone taps Bill. */
  book: PriceBook;
  onAddTotal?: () => void;
}

export const BillSheet: React.FC<BillSheetProps> = ({
  isOpen,
  onClose,
  order,
  book,
  onAddTotal,
}) => {
  const toast = useToast();
  const { prices, coupons, settled } = book;

  const [blob, setBlob] = useState<Blob | null>(null);
  // The drawn bill, shown as soon as it's ready; the PNG (blob) follows for Send and Download.
  const [scene, setScene] = useState<HTMLCanvasElement | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const [painting, setPainting] = useState(false);
  const [paintError, setPaintError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setZoomed(false);
    previewRef.current?.scrollTo(0, 0);
  }, [isOpen, order?.id]);

  // Bill model
  const bill = useMemo(() => {
    if (!order) return null;
    return buildBill({
      order,
      prices: prices ?? null,
      coupons: coupons ?? null,
      now: new Date(),
    });
  }, [order, prices, coupons]);

  // Paint once the prices have answered (loaded or failed), so the bill is drawn
  // once with its amounts, never first with dashes and then again.
  useEffect(() => {
    if (!isOpen || !bill) {
      setBlob(null);
      setScene(null);
      setPainting(false);
      setPaintError(false);
      return;
    }
    if (!settled) {
      setPainting(true);
      return;
    }

    let active = true;
    setPainting(true);
    setPaintError(false);
    setBlob(null);

    paintBillScene(bill)
      .then((canvas) => {
        if (!active) return;
        setScene(canvas);
        setPainting(false);
        return billPng(canvas).then((png) => { if (active) setBlob(png); });
      })
      .catch(() => {
        if (!active) return;
        setPainting(false);
        setPaintError(true);
      });

    return () => {
      active = false;
    };
  }, [isOpen, bill, settled, retryKey]);

  // Copy the drawn bill onto the canvas on screen.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !scene) return;
    view.width = scene.width;
    view.height = scene.height;
    view.getContext('2d')?.drawImage(scene, 0, 0);
  }, [scene, paintError]);

  // Can share files feature check
  const [canShareFiles, setCanShareFiles] = useState(false);
  useEffect(() => {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    ) {
      try {
        const testFile = new File([''], 'test.png', { type: 'image/png' });
        setCanShareFiles(navigator.canShare({ files: [testFile] }));
      } catch {
        setCanShareFiles(false);
      }
    } else {
      setCanShareFiles(false);
    }
  }, []);

  const shareAction = useMemo(() => {
    return billShare(canShareFiles, Boolean(order?.phone));
  }, [canShareFiles, order?.phone]);

  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  const mainBtnRef = useRef<HTMLButtonElement>(null);

  const doDownload = () => {
    if (!blob || !bill) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = billFilename(bill.code);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show({ text: adminCopy.bill.toasts.saved });
  };

  const doShare = async () => {
    if (!blob || !bill) return;
    const filename = billFilename(bill.code);
    const text = billShareText({
      name: bill.name,
      code: bill.code,
      total: bill.payment.kind === 'freeSample' ? null : formatMoney(bill.total),
    });

    try {
      const file = new File([blob], filename, { type: 'image/png' });
      await navigator.share({ files: [file], text });
      toast.show({ text: adminCopy.bill.toasts.shared });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      toast.show({
        text: adminCopy.bill.toasts.shareFailed,
        action: {
          label: adminCopy.bill.download,
          onAction: doDownload,
        },
      });
    } finally {
      mainBtnRef.current?.focus();
    }
  };

  const doDownloadAndChat = () => {
    if (!blob || !bill || !order?.phone) return;
    doDownload();
    const text = billShareText({
      name: bill.name,
      code: bill.code,
      total: bill.payment.kind === 'freeSample' ? null : formatMoney(bill.total),
    });
    const waUrl = `https://wa.me/${order.phone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener');
  };

  if (!order) return null;

  const titleText = adminCopy.bill.title;

  const titleNode = (
    <div>
      <div>{titleText}</div>
      <div className="adm-bill__sub">
        <Code code={order.code} />
        {order.name && ` · ${order.name}`}
      </div>
    </div>
  );

  // Needs total empty state
  if (!bill) {
    return (
      <AdminSheet
        isOpen={isOpen}
        onClose={onClose}
        width={760}
        className="adm-bill-sheet"
        title={titleNode}
        closeLabel={adminCopy.close}
        bar={
          <button
            type="button"
            className="adm-btn adm-btn--primary adm-bill__main"
            onClick={() => {
              onClose();
              onAddTotal?.();
            }}
          >
            {adminCopy.bill.addTotal}
          </button>
        }
      >
        <div className="adm-bill__stage">
          <div className="adm-bill__empty">
            <div className="adm-bill__empty-circle" aria-hidden="true">
              <IndianRupee size={22} />
            </div>
            <h3 className="adm-bill__empty-title">
              {adminCopy.bill.needsTotalTitle}
            </h3>
            <p className="adm-bill__empty-body">
              {adminCopy.bill.needsTotalBody}
            </p>
          </div>
        </div>
      </AdminSheet>
    );
  }

  // Bar notes
  let noteText: string | null = null;
  if (shareAction.kind === 'share') {
    noteText = adminCopy.bill.noNumberShare;
  } else if (shareAction.kind === 'downloadChat') {
    noteText = adminCopy.bill.noShare;
  } else if (shareAction.kind === 'downloadOnly') {
    noteText = adminCopy.bill.noNumber;
  }

  const buttonsDisabled = painting || paintError || !blob;

  const barNode = (
    <div className="adm-bill__actions">
      <ToastSlot />
      {noteText && <p className="adm-bill__note">{noteText}</p>}
      <div className="adm-bill__bar">
        {/* Secondary download button (shown when main is not alone download) */}
        {shareAction.kind !== 'downloadOnly' && (
          <button
            ref={downloadBtnRef}
            type="button"
            className="adm-btn adm-btn--quiet"
            disabled={buttonsDisabled}
            onClick={doDownload}
          >
            <Download size={18} aria-hidden="true" />
            {adminCopy.bill.download}
          </button>
        )}

        {/* Main button */}
        {shareAction.kind === 'send' && (
          <button
            ref={mainBtnRef}
            type="button"
            className="adm-btn adm-btn--primary adm-bill__main"
            disabled={buttonsDisabled}
            onClick={doShare}
          >
            <MessageCircle size={18} aria-hidden="true" />
            {adminCopy.bill.send}
          </button>
        )}
        {shareAction.kind === 'share' && (
          <button
            ref={mainBtnRef}
            type="button"
            className="adm-btn adm-btn--primary adm-bill__main"
            disabled={buttonsDisabled}
            onClick={doShare}
          >
            {adminCopy.bill.share}
          </button>
        )}
        {shareAction.kind === 'downloadChat' && (
          <button
            ref={mainBtnRef}
            type="button"
            className="adm-btn adm-btn--primary adm-bill__main"
            disabled={buttonsDisabled}
            onClick={doDownloadAndChat}
          >
            <Download size={18} aria-hidden="true" />
            {adminCopy.bill.downloadAndChat}
          </button>
        )}
        {shareAction.kind === 'downloadOnly' && (
          <button
            ref={mainBtnRef}
            type="button"
            className="adm-btn adm-btn--primary adm-bill__main"
            disabled={buttonsDisabled}
            onClick={doDownload}
          >
            <Download size={18} aria-hidden="true" />
            {adminCopy.bill.download}
          </button>
        )}
      </div>
    </div>
  );

  const altText = adminCopy.bill.alt(
    bill.code,
    bill.name,
    bill.payment.kind === 'freeSample' ? formatMoney(0) : formatMoney(bill.total),
  );

  return (
    <AdminSheet
      isOpen={isOpen}
      onClose={onClose}
      width={760}
      className="adm-bill-sheet"
      title={titleNode}
      closeLabel={adminCopy.close}
      bar={barNode}
    >
      <div className="adm-bill__preview">
        {scene && !paintError && (
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm adm-bill__zoom"
            aria-pressed={zoomed} onClick={() => { setZoomed((value) => !value); previewRef.current?.scrollTo(0, 0); }}>
            {zoomed ? adminCopy.bill.fit : adminCopy.bill.zoom}
          </button>
        )}
        <div ref={previewRef} tabIndex={zoomed ? 0 : undefined} role={zoomed ? 'region' : undefined}
          aria-label={zoomed ? adminCopy.bill.preview : undefined}
          className={`adm-bill__stage${zoomed ? ' is-zoomed' : ''}`}>
          {paintError ? (
            <div className="adm-bill__error">
              <p>{adminCopy.bill.failed}</p>
              <button
                type="button"
                className="adm-btn adm-btn--quiet adm-btn--sm"
                onClick={() => setRetryKey((k) => k + 1)}
              >
                {adminCopy.bill.retry}
              </button>
            </div>
          ) : scene ? (
            <canvas
              ref={viewRef}
              role="img"
              aria-label={altText}
              className={`adm-bill__img${painting ? ' is-painting' : ''}`}
            />
          ) : (
            <div className="adm-bill__placeholder" aria-hidden="true" />
          )}
        </div>
      </div>
    </AdminSheet>
  );
};
