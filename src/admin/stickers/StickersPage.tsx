import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { Field, LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import { ToastSlot, useToast } from '../toast/Toast';
import { getKitchen } from '../api';
import { useRpc } from '../useRpc';
import { useUnsavedWork } from '../unsavedWork';
import {
  BATCH_PREFIX,
  SHELF_LIFE,
  batchCode,
  batchSequenceFor,
  formatDDMMYYYY,
  mrpSource,
  unitPrice,
  useByDate,
  type StickerProductId,
} from './stickerMath';
import { cellTrimOrigin, modeOptionsFor, specFor, type SheetSpec, type StickerSide } from './sheetSpecs';
import { makeSheetPdf } from './makeSheetPdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const copy = adminCopy.stickers;

type ProductId = StickerProductId;
type Pack = '100 g' | '250 g';
type MrpMode = 'default' | 'gift' | 'custom';

const WHATSAPP_URL = `https://wa.me/${copy.whatsappTo}`;

const whatsappLink = (text: string): string => `${WHATSAPP_URL}?text=${encodeURIComponent(text)}`;

const PRODUCTS: { id: ProductId; dot: string }[] = [
  { id: 'raggi-jaggi', dot: 'adm-st-dot--rj' },
  { id: 'muesli', dot: 'adm-st-dot--ms' },
  { id: 'bites', dot: 'adm-st-dot--db' },
];

const productName = (id: ProductId): string => productsData.find((p) => p.id === id)?.name ?? id;

const gramsOf = (pack: Pack): number => (pack === '250 g' ? 250 : 100);

/** The MRP printed on the pack (founder-locked in products.ts), never the site's list. */
const printedMrp = (productId: ProductId, pack: Pack): number | null => {
  const mrp = productsData.find((p) => p.id === productId)?.labelMrp[pack];
  return typeof mrp === 'number' && mrp > 0 ? mrp : null;
};

// The one place the page picks a sheet, kind included.
const resolveSpec = (
  productId: ProductId,
  pack: Pack,
  side: StickerSide,
  mode: MrpMode,
): SheetSpec | null => specFor(productId, pack, side, mode);

const MONEY_RE = /^(?!0+(?:\.0{1,2})?$)\d{1,5}(\.\d{1,2})?$/;

/** Local "today" as a fallback while the kitchen (IST today) loads. */
const localToday = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A PDF's first page painted at ~2x device pixels for the stage preview. */
async function rasterizeFirstPage(pdfBytes: Uint8Array, scale: number): Promise<HTMLCanvasElement> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  const task = getDocument({ data: pdfBytes.slice().buffer as ArrayBuffer });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    await page.render({ canvas, viewport }).promise;
    await page.cleanup();
    return canvas;
  } finally {
    await task.destroy();
  }
}

/**
 * Raster scale from a pixel budget for the sticker's own trim box, not from the
 * device pixel ratio. The stage scales the canvas up with CSS, so a DPR-based
 * raster is too small and reads soft on anything wider than a phone. Capped so
 * the offscreen full-sheet canvas stays inside phone memory.
 */
function rasterScale(spec: SheetSpec, targetLongEdgePx: number): number {
  const longMm = Math.max(spec.trim[0], spec.trim[1]);
  const wanted = (targetLongEdgePx * 25.4) / (72 * longMm);
  const sheetLongMm =
    Math.max(spec.cols * spec.pitch[0], spec.rowsCount * spec.pitch[1]) + spec.bleed * 2 + 24;
  const maxScale = Math.sqrt(26_000_000) / (sheetLongMm * (72 / 25.4));
  return Math.min(wanted, maxScale);
}

/**
 * Crop one sticker's trim box out of a full-sheet render. pdf.js works in CSS
 * px at 72 dpi; the sheet geometry is mm, so 1 mm = scale × 72/25.4 px.
 */
function cropTrim(source: HTMLCanvasElement, spec: SheetSpec, scale: number): HTMLCanvasElement {
  const pxPerMm = (scale * 72) / 25.4;
  const [tx, ty] = cellTrimOrigin(spec, 0);
  const sx = Math.round(tx * pxPerMm);
  const sy = Math.round(ty * pxPerMm);
  const sw = Math.round(spec.trim[0] * pxPerMm);
  const sh = Math.round(spec.trim[1] * pxPerMm);
  const out = document.createElement('canvas');
  out.width = Math.max(1, sw);
  out.height = Math.max(1, sh);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** The exact bytes Download saves, and the picture the stage shows. */
interface Build {
  bytes: Uint8Array;
  url: string;
  fileName: string;
  spec: SheetSpec;
  /** The message for exactly these bytes, so word and file cannot drift apart. */
  shareUrl: string;
}

/**
 * /admin/stickers. Sunit picks product, pack, side, MRP mode and made-on day,
 * reads back exactly what will print, then Creates a full-screen stage with
 * one sticker, or Create-and-sends straight to WhatsApp at 9850198697.
 */
const StickersPage: React.FC = () => {
  const toast = useToast();
  const kitchen = useRpc(getKitchen, []);

  const today: string = kitchen.data?.today ?? '';

  const [productId, setProductId] = useState<ProductId>('raggi-jaggi');
  const [pack, setPack] = useState<Pack>('250 g');
  const [side, setSide] = useState<StickerSide>('back');
  const [mode, setMode] = useState<MrpMode>('default');
  const [customMrpRaw, setCustomMrpRaw] = useState('');
  const [madeOn, setMadeOn] = useState<string>('');

  const [stage, setStage] = useState<'form' | 'stage'>('form');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [making, setMaking] = useState(false);
  const [build, setBuild] = useState<Build | null>(null);
  const [buildError, setBuildError] = useState<'failed' | 'signed-out' | 'no-sheet' | null>(null);
  const [waFallback, setWaFallback] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  // IST today lands with the kitchen; before that the page shows skeletons.
  useEffect(() => {
    if (today && !madeOn) setMadeOn(today);
  }, [today, madeOn]);

  // Date Bites 250 g prints on the one-sided container sticker.
  useEffect(() => {
    if (productId === 'bites' && pack === '250 g' && side !== 'back') setSide('back');
  }, [productId, pack, side]);

  const shelf = SHELF_LIFE[productId];

  // The kitchen's own number for this product and day, -2/-3 included: it gives
  // the first batch of the day the plain code, so the sticker matches it.
  const dayCodes = useMemo(
    () => (kitchen.data?.batches ?? []).filter((b) => b.product_id === productId && b.made_on === madeOn && b.code).map((b) => b.code!),
    [kitchen.data, productId, madeOn],
  );
  const batch = today && madeOn
    ? batchCode(BATCH_PREFIX[productId], madeOn, batchSequenceFor(BATCH_PREFIX[productId], madeOn, dayCodes))
    : '';
  const useBy = madeOn ? useByDate(productId, madeOn) : '';
  const madeOnValid = Boolean(madeOn) && (!today || (madeOn >= addDays(today, -60) && madeOn <= addDays(today, 14)));

  /** The sheet's shape, kind-independent: the gift twin shares it. */
  const baseSpec = useMemo(() => specFor(productId, pack, side), [productId, pack, side]);
  const stamps = baseSpec?.stamp != null;

  const founderMrp = printedMrp(productId, pack);
  const options = modeOptionsFor(baseSpec, founderMrp !== null);

  /** A front prints nothing variable, so the kind never applies there. */
  const activeMode: MrpMode = stamps ? mode : 'default';

  const spec = useMemo(
    () => resolveSpec(productId, pack, side, activeMode),
    [productId, pack, side, activeMode],
  );

  const isGift = activeMode === 'gift';
  const customText = customMrpRaw.trim();
  const customNum = Number(customText);
  const customValid = MONEY_RE.test(customText) && customNum > 0;
  const typedMrp = activeMode === 'custom' && customValid ? customNum : null;
  const resolved = isGift
    ? { mrp: null as number | null, source: 'missing' as const }
    : mrpSource(founderMrp, typedMrp);
  const mrp = resolved.mrp;
  const mrpSourceLabel = isGift || resolved.source === 'missing' ? null : copy.mrpSources[resolved.source];
  const mrpValid = activeMode !== 'custom' || customValid;
  const noPrice = stamps && !isGift && mrp === null;

  // What the read-back shows. A Custom price that is empty or mistyped is not
  // a price at all: the rows stay blank until he types a real one (Create is
  // off meanwhile, so nothing can print). `mrp` above keeps the fallback for
  // the Default path only.
  const showMrp = activeMode === 'custom' && !customValid ? null : mrp;
  const mrpLabel = isGift ? copy.giftMrp : showMrp !== null ? showMrp.toFixed(2) : '—';
  const unitLabel = isGift ? copy.giftUnit : showMrp !== null ? copy.perGram(unitPrice(showMrp, gramsOf(pack))) : '—';

  const datesOk = Boolean(batch && useBy && madeOnValid);
  const canCreate = Boolean(
    today
    && spec
    && !making
    && (!stamps
      || (options[activeMode] && datesOk && (isGift || (mrp !== null && mrpValid)))),
  );

  // Auto-Gift only where the site sells no such pack. A sold pack with every
  // price source down must fall to Custom (a visible prompt), never to GIFT.
  const fallbackMode: MrpMode =
    options.default ? 'default'
      : options.gift && founderMrp === null ? 'gift'
        : 'custom';

  // A kind this sheet cannot print falls back to one it can.
  const modeValid = options[mode];
  useEffect(() => {
    if (!stamps || modeValid) return;
    setMode(fallbackMode);
  }, [stamps, modeValid, fallbackMode]);

  // Carrying a typed price from one product/pack onto another would print the
  // wrong price, so a new product/pack starts with an empty Custom price.
  const priceScope = `${productId}|${pack}`;
  const lastScope = useRef(priceScope);
  useEffect(() => {
    if (lastScope.current === priceScope) return;
    lastScope.current = priceScope;
    setCustomMrpRaw('');
  }, [priceScope]);
  const days = useMemo(() => {
    const base = today || localToday();
    return Array.from({ length: 7 }, (_, i) => addDays(base, -i));
  }, [today]);

  const fine = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    [],
  );

  const dirty = useRef(false);
  useUnsavedWork(() => making || dirty.current || stage !== 'form');
  useEffect(() => {
    dirty.current = stage !== 'form';
  }, [stage]);

  /** Free the old blob URL when a new build replaces it. */
  const revokeRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
  }, []);

  const rememberUrl = useCallback((url: string) => {
    if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    revokeRef.current = url;
  }, []);

  const buildSheet = useCallback(async (): Promise<Build | null> => {
    if (!spec) {
      setBuildError('no-sheet');
      return null;
    }
    if (spec.stamp && !useBy) {
      setBuildError('no-sheet');
      return null;
    }
    setBuildError(null);
    setWaFallback(false);
    // A back needs money; a front stamps nothing, so it needs none.
    if (spec.stamp && !isGift && (mrp === null || !mrpValid)) {
      setBuildError('failed');
      return null;
    }
    try {
      const stampsHere = spec.stamp != null;
      const values = {
        mrp: !stampsHere ? '' : isGift ? 'GIFT' : mrp != null ? mrp.toFixed(2) : '',
        unit: !stampsHere ? '' : isGift ? 'for you' : mrp != null ? `${unitPrice(mrp, gramsOf(pack))} per g` : '',
        gift: stampsHere && isGift,
        batch: stampsHere ? batch : '',
        madeOn: stampsHere ? formatDDMMYYYY(madeOn) : '',
        useBy: stampsHere ? formatDDMMYYYY(useBy) : '',
      };
      const bytes = await makeSheetPdf(values, spec);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      rememberUrl(url);
      const line = `${productName(productId)} ${pack}`;
      const message = stampsHere
        ? copy.shareText(line, batch, `${formatDDMMYYYY(madeOn)} to ${formatDDMMYYYY(useBy)}`, mrpLabel)
        : copy.shareTextFront(line);
      const slug = (s: string): string => s.replace(/\s+/g, '-');
      const next: Build = {
        bytes,
        url,
        fileName: stampsHere
          ? `Shahs-Nutrition-Sticker-${batch}.pdf`
          : `Shahs-Nutrition-Front-${slug(productName(productId))}-${slug(pack)}.pdf`,
        spec,
        shareUrl: whatsappLink(message),
      };
      setBuild(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setBuildError(/unauthorized|unauthorised|sign|auth|jwt/i.test(message) ? 'signed-out' : 'failed');
      setBuild(null);
      return null;
    }
  }, [spec, useBy, isGift, mrp, mrpValid, batch, madeOn, mrpLabel, productId, pack, rememberUrl]);

  const doCreate = useCallback(async () => {
    if (!canCreate) return;
    setMaking(true);
    try {
      const made = await buildSheet();
      if (made) setStage('stage');
    } finally {
      setMaking(false);
    }
  }, [canCreate, buildSheet]);

  /** One save path for Download and Send: exactly the bytes the stage shows. */
  const saveFile = useCallback((b: Build, announce = true) => {
    const a = document.createElement('a');
    a.href = b.url;
    a.download = b.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (announce) toast.show({ text: copy.downloaded });
  }, [toast]);

  /** Create and send: the blank tab opens in the tap, navigated once the PDF exists. */
  const doCreateAndSend = useCallback(() => {
    if (!canCreate) return;
    setWaFallback(false);
    const win = window.open('about:blank', '_blank');
    if (win) win.opener = null;
    setMaking(true);
    void buildSheet().then((made) => {
      setMaking(false);
      if (!made) {
        win?.close();
        return;
      }
      saveFile(made, false);
      if (win) {
        win.location.replace(made.shareUrl);
        toast.show({ text: copy.sent });
      } else {
        setWaFallback(true);
        setStage('stage');
        toast.show({ text: copy.fallbackNote });
      }
    });
  }, [canCreate, buildSheet, saveFile, toast]);

  /** Send from the stage: same gesture rule, the PDF is already built. */
  const doSend = useCallback(() => {
    if (!build) return;
    setWaFallback(false);
    // Opened inside the tap so no blocker eats it; the handle survives because
    // 'noopener' is not a feature here, and opener is severed by hand.
    const win = window.open('about:blank', '_blank');
    if (win) win.opener = null;
    saveFile(build, false);
    if (win) {
      win.location.replace(build.shareUrl);
      toast.show({ text: copy.sent });
    } else {
      setWaFallback(true);
      toast.show({ text: copy.fallbackNote });
    }
  }, [build, saveFile, toast]);

  const doDownload = useCallback(() => {
    if (!build) return;
    saveFile(build);
  }, [build, saveFile]);

  const closeStage = useCallback(() => {
    setStage('form');
    setZoomOpen(false);
    setZoomed(false);
  }, []);

  if (kitchen.error && !kitchen.data) {
    return (
      <div className="adm-page adm-st-page">
        <div className="adm-st-page__head">
          <AdminLink className="adm-back adm-back--start adm-phone-only adm-st-back" to="/admin/more">
            <ChevronLeft size={20} aria-hidden="true" />{copy.back}
          </AdminLink>
          <h1 className="adm-title">{copy.title}</h1>
          <p className="adm-muted">{copy.intro}</p>
        </div>
        <div className="adm-st-grid">
          <LoadError onRetry={() => kitchen.reload()} />
        </div>
      </div>
    );
  }
  if (!kitchen.data || !today) {
    return (
      <div className="adm-page adm-st-page">
        <div className="adm-st-page__head">
          <AdminLink className="adm-back adm-back--start adm-phone-only adm-st-back" to="/admin/more">
            <ChevronLeft size={20} aria-hidden="true" />{copy.back}
          </AdminLink>
          <h1 className="adm-title">{copy.title}</h1>
          <p className="adm-muted">{copy.intro}</p>
        </div>
        <div className="adm-st-grid">
          <Skeleton cards={3} rows={3} />
        </div>
      </div>
    );
  }

  // Why Create is off, in the bar's own words. Null while he can press it.
  const reason: string | null = making
    ? copy.making
    : !madeOnValid
      ? copy.badDay
      : activeMode === 'custom' && !customValid
        ? copy.needMrp
        : null;

  const line = `${productName(productId)} ${pack}`;
  const summary = !stamps ? copy.frontSummary(line) : null;

  const tapToZoom = fine ? copy.tapToZoom.mouse : copy.tapToZoom.touch;
  const zoomHint = fine ? copy.zoomHint.mouse : copy.zoomHint.touch;

  const fromPicker = Boolean(madeOn) && !days.includes(madeOn);
  const dayName = madeOn
    ? new Date(`${madeOn}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
    : '';

  const isContainer = productId === 'bites' && pack === '250 g';
  const kindNote: string | null = !stamps
    ? null
    : !options.default
      ? copy.noDefaultPrice(pack)
      : !options.gift
        ? copy.noGiftSheet
        : null;

  return (
    <div className="adm-page adm-st-page">
      <div className="adm-st-page__head">
        <AdminLink className="adm-back adm-back--start adm-phone-only adm-st-back" to="/admin/more">
          <ChevronLeft size={20} aria-hidden="true" />{copy.back}
        </AdminLink>
        <h1 className="adm-title">{copy.title}</h1>
        <p className="adm-muted">{copy.intro}</p>
      </div>

      <div className="adm-st-grid">
        <section className="adm-card" aria-labelledby="st-product">
          <h2 className="adm-of__h" id="st-product">{copy.products}</h2>
          <fieldset className="adm-st-tiles">
            <legend className="visually-hidden">{copy.products}</legend>
            {PRODUCTS.map(({ id, dot }) => (
              <label key={id}>
                <input type="radio" name="st-product" checked={productId === id} onChange={() => setProductId(id)} />
                <span><i className={`adm-st-dot ${dot}`} aria-hidden="true" />{productName(id)}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="adm-card" aria-labelledby="st-size">
          <h2 className="adm-of__h" id="st-size">{copy.size}</h2>
          <fieldset className="adm-st-chips">
            <legend className="visually-hidden">{copy.size}</legend>
            {(['100 g', '250 g'] as Pack[]).map((p) => (
              <label key={p}>
                <input type="radio" name="st-size" checked={pack === p} onChange={() => setPack(p)} />
                <span>{p}</span>
              </label>
            ))}
            <label>
              <input type="radio" name="st-size" disabled aria-describedby="st-500-note" onChange={() => {}} checked={false} />
              <span>{copy.size500}</span>
            </label>
          </fieldset>
          <p className="adm-st-note" id="st-500-note">{copy.size500Note}</p>
          {isContainer ? (
            <p className="adm-st-note adm-st-note--body">{copy.containerSide}</p>
          ) : (
            <>
              <h3 className="adm-of__h" id="st-side" style={{ marginTop: 12 }}>{copy.side}</h3>
              <fieldset className="adm-st-chips" aria-labelledby="st-side">
                {(['front', 'back'] as StickerSide[]).map((s) => (
                  <label key={s}>
                    <input
                      type="radio"
                      name="st-side"
                      checked={side === s}
                      onChange={() => setSide(s)}
                    />
                    <span>{copy.sides[s]}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </section>

        {stamps && (
        <section className="adm-card adm-st-swap" aria-labelledby="st-kind">
          <h2 className="adm-of__h" id="st-kind">{copy.kind}</h2>
          <fieldset className="adm-st-chips">
            <legend className="visually-hidden">{copy.kind}</legend>
            {(['default', 'gift', 'custom'] as MrpMode[]).map((m) => (
              <label key={m}>
                <input
                  type="radio"
                  name="st-kind"
                  checked={mode === m}
                  disabled={!options[m]}
                  aria-describedby={!options[m] ? 'st-kind-note' : undefined}
                  onChange={() => setMode(m)}
                />
                <span>{copy.kinds[m]}</span>
              </label>
            ))}
          </fieldset>
          {kindNote && <p className="adm-st-note adm-st-note--body" id="st-kind-note">{kindNote}</p>}
          {mode === 'default' && (
            <div className="adm-st-mrp">
              <Field label={copy.mrp} hint={mrpSourceLabel ?? undefined}>
                <input className="adm-input" value={mrp !== null ? `₹${mrp.toFixed(2)}` : '—'} readOnly aria-readonly="true" />
              </Field>
              {noPrice && <p className="adm-st-warn" role="alert">{copy.noDefaultPrice(pack)}</p>}
            </div>
          )}
          {mode === 'custom' && (
            <div className="adm-st-mrp">
              <Field label={copy.customMrp} error={customText && !customValid ? copy.mrpError : null} prefix="₹">
                <input
                  type="text"
                  inputMode="decimal"
                  className="adm-input"
                  value={customMrpRaw}
                  placeholder={copy.customMrpPlaceholder}
                  onChange={(e) => setCustomMrpRaw(e.target.value)}
                />
              </Field>
            </div>
          )}
        </section>
        )}

        {stamps && (
        <section className="adm-card adm-st-swap" aria-labelledby="st-madeon">
          <h2 className="adm-of__h" id="st-madeon">{copy.madeOn}</h2>
          <fieldset className="adm-st-days">
            <legend className="visually-hidden">{copy.madeOn}</legend>
            {days.map((day) => (
              <label key={day}>
                <input type="radio" name="st-day" checked={madeOn === day} onChange={() => setMadeOn(day)} />
                <span>
                  {day === today
                    ? 'Today'
                    : new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
                  <small>{formatDDMMYYYY(day).slice(0, 5)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="adm-field">
            <label htmlFor="st-date" className="adm-field__label">{copy.calendarLabel}</label>
            <span className={`adm-st-datepick${fromPicker ? ' is-picked' : ''}`}>
              <span aria-hidden="true">{madeOn ? `${formatDDMMYYYY(madeOn)} · ${dayName}` : '—'}</span>
              <CalendarDays size={20} aria-hidden="true" />
              <input
                id="st-date" type="date" value={madeOn}
                min={addDays(today, -60)} max={addDays(today, 14)}
                onChange={(e) => { if (e.target.value) setMadeOn(e.target.value); }}
              />
            </span>
            {!madeOnValid && <p className="adm-st-warn" role="alert">{copy.badDay}</p>}
          </div>
        </section>
        )}

      </div>

      <div className="adm-st-page__side">
        {!stamps ? (
          <section className="adm-card adm-st-check-card adm-st-swap" aria-labelledby="st-check" aria-live="polite">
            <h2 className="adm-of__h" id="st-check">{copy.frontTitle}</h2>
            <p className="adm-muted">{copy.frontBody}</p>
            {spec && <p className="adm-st-note">{copy.sheetFacts(spec.cells, spec.trim[0], spec.trim[1])}</p>}
          </section>
        ) : (
        <section className="adm-card adm-st-check-card adm-st-swap" aria-labelledby="st-check" aria-live="polite">
          <h2 className="adm-of__h" id="st-check">{copy.onSticker}</h2>
          <dl className="adm-st-check">
            <li><dt>{copy.batch}</dt><dd className="adm-st-mono">{batch || '—'}</dd></li>
            <li><dt>{copy.made}</dt><dd>{madeOn ? formatDDMMYYYY(madeOn) : '—'}</dd></li>
            <li>
              <dt>{copy.useBy}<span className="adm-st-rule">{shelf.unit === 'months' ? copy.ruleMonths(shelf.amount) : copy.ruleDays(shelf.amount)}</span></dt>
              <dd>{useBy ? formatDDMMYYYY(useBy) : '—'}</dd>
            </li>
            <li>
              <dt>{copy.mrp}{isGift
                ? <span className="adm-st-tag">{copy.giftTag}</span>
                : mrpSourceLabel && <span className="adm-st-tag">{mrpSourceLabel}</span>}</dt>
              <dd>{mrpLabel}</dd>
            </li>
            <li>
              <dt>{copy.unitPrice}</dt>
              <dd>{unitLabel}</dd>
            </li>
          </dl>
          {baseSpec && (
            <p className="adm-st-note">{copy.sheetFacts(baseSpec.cells, baseSpec.trim[0], baseSpec.trim[1])}</p>
          )}
        </section>
        )}

        <div className="adm-st-page__bar">
        <div className="adm-st-bar__line" aria-live="polite">
          {reason ? (
            <p className="adm-st-bar__reason">{reason}</p>
          ) : !stamps ? (
            <p className="adm-st-bar__reason">{summary}</p>
          ) : (
            <>
              <p className="adm-st-bar__row adm-st-bar__row--key">
                <span className="adm-st-mono">{batch}</span>
                <span>{isGift ? copy.giftMrp : showMrp != null ? `₹${showMrp.toFixed(2)}` : '—'}</span>
              </p>
              <p className="adm-st-bar__row adm-st-bar__row--sub">
                <span>{copy.barMade} {formatDDMMYYYY(madeOn)}</span>
                <span>{copy.useBy} {formatDDMMYYYY(useBy)}</span>
              </p>
            </>
          )}
        </div>
        {buildError === 'failed' && (
          <p className="adm-st-warn" role="alert">
            {copy.makeFailed}{' '}
            <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={doCreate}>{copy.retry}</button>
          </p>
        )}
        {buildError === 'signed-out' && <p className="adm-st-warn" role="alert">{copy.signedOut}</p>}
        {buildError === 'no-sheet' && <p className="adm-st-warn" role="alert">{copy.noSheet}</p>}
        <div className="adm-st-bar__btns">
          <button type="button" className="adm-btn adm-btn--quiet" disabled={!canCreate} onClick={doCreate}>
            {copy.create}
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={!canCreate} onClick={doCreateAndSend}>
            {copy.createAndSend}
          </button>
        </div>
        </div>
      </div>

      {stage === 'stage' && (
        <Stage
          title={stamps ? copy.stageTitle(batch) : copy.stageTitleFront(line)}
          batch={batch}
          build={build}
          zoomHint={tapToZoom}
          downloadLabel={copy.download}
          sendLabel={copy.send}
          fallbackNote={copy.fallbackNote}
          attachHint={copy.attachHint}
          openWhatsAppLabel={copy.openWhatsApp}
          waUrl={build?.shareUrl ?? WHATSAPP_URL}
          waFallback={waFallback}
          onDownload={doDownload}
          onSend={doSend}
          onClose={closeStage}
          onZoom={() => setZoomOpen(true)}
        />
      )}

      {zoomOpen && build && (
        <ZoomView
          title={copy.zoomedTitle}
          hint={zoomHint}
          build={build}
          zoomed={zoomed}
          onToggleZoom={() => setZoomed((z) => !z)}
          onClose={() => { setZoomOpen(false); setZoomed(false); }}
        />
      )}
      <ToastSlot />
    </div>
  );
};

/** Full-screen stage: one sticker cropped to its trim box, Download + Send pinned. */
const Stage: React.FC<{
  title: string;
  batch: string;
  build: Build | null;
  zoomHint: string;
  downloadLabel: string;
  sendLabel: string;
  fallbackNote: string;
  attachHint: string;
  openWhatsAppLabel: string;
  waUrl: string;
  waFallback: boolean;
  onDownload: () => void;
  onSend: () => void;
  onClose: () => void;
  onZoom: () => void;
}> = ({ title, build, zoomHint, downloadLabel, sendLabel, fallbackNote, attachHint, openWhatsAppLabel, waUrl, waFallback, onDownload, onSend, onClose, onZoom }) => {
  const canvasHost = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The picture is the PDF rasterised, cropped to one trim box — not a re-render.
  useEffect(() => {
    let live = true;
    const host = canvasHost.current;
    if (host && build) {
      const ratio = rasterScale(build.spec, 1000);
      void rasterizeFirstPage(build.bytes, ratio).then((full) => {
        if (!live) return;
        const cropped = cropTrim(full, build.spec, ratio);
        host.querySelector('canvas')?.remove();
        host.prepend(cropped);
      }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [build]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="adm-st-stage" role="dialog" aria-modal="true" aria-label={title}>
      <div className="adm-st-stage__head">
        <button ref={closeRef} type="button" className="adm-btn adm-btn--quiet adm-st-stage__back" onClick={onClose} aria-label="Close">
          <X size={22} aria-hidden="true" />
        </button>
        <h2>{title}</h2>
      </div>
      <div className="adm-st-stage__body">
        {build ? (
          <button ref={canvasHost} type="button" className="adm-st-stage__shot" style={{ '--st-ar': build ? build.spec.trim[0] / build.spec.trim[1] : undefined } as React.CSSProperties} onClick={onZoom} aria-label={zoomHint} title={zoomHint}>
            <span className="adm-st-note">{zoomHint}</span>
          </button>
        ) : (
          <p className="adm-st-stage__empty">…</p>
        )}
      </div>
      <div className="adm-st-stage__bar">
        <button type="button" className="adm-btn adm-btn--quiet" disabled={!build} onClick={onDownload}>
          {downloadLabel}
        </button>
        <button type="button" className="adm-btn adm-btn--primary" disabled={!build} onClick={onSend}>
          {sendLabel}
        </button>
      </div>
      {waFallback && (
        <div className="adm-st-stage__fallback">
          <p className="adm-st-warn" role="alert">{fallbackNote} {attachHint}</p>
          <a className="adm-btn adm-btn--primary" href={waUrl} target="_blank" rel="noopener noreferrer">
            {openWhatsAppLabel}
          </a>
        </div>
      )}
    </div>
  );
};

/** Bigger view with pinch-zoom + pan; the surface owns the gesture. */
const ZoomView: React.FC<{
  title: string;
  hint: string;
  build: Build;
  zoomed: boolean;
  onToggleZoom: () => void;
  onClose: () => void;
}> = ({ title, hint, build, zoomed, onToggleZoom, onClose }) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ gap: number; scale: number } | null>(null);

  useEffect(() => {
    let live = true;
    const ratio = rasterScale(build.spec, 1500);
    void rasterizeFirstPage(build.bytes, ratio).then((full) => {
      if (!live) return;
      const cropped = cropTrim(full, build.spec, ratio);
      canvasRef.current = cropped;
      surfaceRef.current?.querySelector('canvas')?.remove();
      surfaceRef.current?.append(cropped);
      applyView();
    }).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build]);

  const applyView = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { scale, x, y } = view.current;
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };

  useEffect(() => {
    view.current = { scale: zoomed ? 2 : 1, x: 0, y: 0 };
    applyView();
  }, [zoomed]);

  useEffect(() => {
    closeRef.current?.focus();
    const surface = surfaceRef.current;
    if (!surface) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    const down = (e: PointerEvent): void => {
      surface.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinchStart.current = { gap: Math.hypot(a.x - b.x, a.y - b.y), scale: view.current.scale };
      }
    };
    const move = (e: PointerEvent): void => {
      if (!pointers.current.has(e.pointerId)) return;
      const prev = pointers.current.get(e.pointerId)!;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        view.current.x += e.clientX - prev.x;
        view.current.y += e.clientY - prev.y;
        applyView();
      } else if (pointers.current.size === 2 && pinchStart.current) {
        const [a, b] = [...pointers.current.values()];
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart.current.gap > 0) {
          view.current.scale = Math.min(5, Math.max(1, pinchStart.current.scale * (gap / pinchStart.current.gap)));
          applyView();
        }
      }
    };
    const up = (e: PointerEvent): void => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;
    };
    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    return () => {
      document.removeEventListener('keydown', onKey);
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', up);
      surface.removeEventListener('pointercancel', up);
    };
  }, [onClose]);

  return (
    <div className="adm-st-zoom" role="dialog" aria-modal="true" aria-label={title}>
      <div className="adm-st-zoom__head">
        <button ref={closeRef} type="button" className="adm-btn adm-btn--quiet adm-st-zoom__close" onClick={onClose} aria-label="Close">
          <X size={22} aria-hidden="true" />
        </button>
        <h2>{title}</h2>
      </div>
      <div
        ref={surfaceRef}
        className="adm-st-zoom__surface"
        style={{ '--st-ar': build.spec.trim[0] / build.spec.trim[1] } as React.CSSProperties}
        onDoubleClick={onToggleZoom}
      />
      <p className="adm-st-zoom__hint">{hint}</p>
    </div>
  );
};

export default StickersPage;
