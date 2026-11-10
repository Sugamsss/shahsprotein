// The picture the stage shows: one sticker's trim box, cropped out of a
// full-sheet pdf.js render of the exact bytes that were built.
//
// It lives apart from the page so the geometry can be tested without a browser
// (rasterScale is pure) and so the page stays about the form.
import { loadPdfjs } from './pdfjs';
import { cellTrimOrigin, type SheetSpec } from './sheetSpecs';

/** Long edge, in device pixels, of the sticker the stage shows. */
export const STAGE_TARGET_PX = 1000;

/** Long edge for the zoom view, which is read at arm's length on a phone. */
export const ZOOM_TARGET_PX = 1500;

/**
 * Raster scale from a pixel budget for the sticker's own trim box, not from the
 * device pixel ratio. The stage scales the canvas up with CSS, so a DPR-based
 * raster is too small and reads soft on anything wider than a phone. Capped so
 * the offscreen full-sheet canvas stays inside phone memory.
 */
export function rasterScale(spec: SheetSpec, targetLongEdgePx: number): number {
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
export function cropTrim(source: HTMLCanvasElement, spec: SheetSpec, scale: number): HTMLCanvasElement {
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

/**
 * Rasterise page 1 of a built sheet and crop it to the first sticker. The
 * full-sheet canvas is released before returning: it is several times the
 * crop's pixels and nothing needs it once the crop is drawn.
 */
export async function sheetPreview(
  pdfBytes: Uint8Array,
  spec: SheetSpec,
  targetLongEdgePx: number = STAGE_TARGET_PX,
): Promise<HTMLCanvasElement> {
  const { getDocument } = await loadPdfjs();  // one memoised import
  // pdf.js takes ownership of the buffer it is given, so it gets its own copy.
  const task = getDocument({ data: pdfBytes.slice().buffer as ArrayBuffer });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const scale = rasterScale(spec, targetLongEdgePx);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    await page.render({ canvas, viewport }).promise;
    await page.cleanup();
    const cropped = cropTrim(canvas, spec, scale);
    canvas.width = 0;
    canvas.height = 0;
    return cropped;
  } finally {
    await task.destroy();
  }
}
