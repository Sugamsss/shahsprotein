import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, IndianRupee, MessageCircle } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { Code } from './OrderCard';
import { formatMoney } from '../format';
import { ToastSlot, useToast } from '../toast';
import type { Order } from '../types';
import { billFilename } from './billPaint';
import { paintBillScene as paintBill } from './billScene';
import { billShare, billShareText, buildBill } from './bill';
import { usePriceBook } from './usePriceBook';

export interface BillSheetProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  /** 'delivered' when opened immediately after marking delivered; 'again' when opened from menu */
  moment?: 'delivered' | 'again';
  onAddTotal?: () => void;
}

export const BillSheet: React.FC<BillSheetProps> = ({
  isOpen,
  onClose,
  order,
  moment = 'again',
  onAddTotal,
}) => {
  const toast = useToast();
  const { prices, coupons } = usePriceBook(isOpen);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [painting, setPainting] = useState(false);
  const [paintError, setPaintError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

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

  // Clean up object URL
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  // Paint the bill when bill data or retryKey changes
  useEffect(() => {
    if (!isOpen || !bill) {
      setBlob(null);
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPainting(false);
      setPaintError(false);
      return;
    }

    let active = true;
    setPainting(true);
    setPaintError(false);

    paintBill(bill)
      .then((newBlob) => {
        if (!active) return;
        setBlob(newBlob);
        const url = URL.createObjectURL(newBlob);
        setImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPainting(false);
      })
      .catch(() => {
        if (!active) return;
        setPainting(false);
        setPaintError(true);
      });

    return () => {
      active = false;
    };
  }, [isOpen, bill, retryKey]);

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

  const titleText =
    moment === 'delivered'
      ? adminCopy.bill.titleDelivered
      : adminCopy.bill.title;

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
      title={titleNode}
      closeLabel={adminCopy.close}
      bar={barNode}
    >
      <div className="adm-bill__stage">
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
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={altText}
            className={`adm-bill__img${painting ? ' is-painting' : ''}`}
          />
        ) : (
          <div className="adm-bill__placeholder" aria-hidden="true" />
        )}
      </div>
    </AdminSheet>
  );
};
