import { siteConfig } from '../../data/siteConfig';
import { adminCopy } from '../../data/adminCopy';
import { formatMoney } from '../format';
import { logoSrc } from '../../utils/themeAssets';
import type { Bill, BillSum } from './bill';
import { billPalette } from './billPalette';

export const billFilename = (code: string) => `Shahs-Nutrition-Bill-${code}.png`;

// Fonts and the logo load once per visit: the second bill starts drawing at once.
// A failed load isn't kept, so the next bill (or Try again) asks again.
let fontsLoad: Promise<void> | null = null;
let logoLoad: Promise<HTMLImageElement> | null = null;

const loadFonts = (): Promise<void> => (fontsLoad ??= fetchFonts());
const loadLogo = (): Promise<HTMLImageElement> =>
  (logoLoad ??= fetchLogo().catch((error: unknown) => { logoLoad = null; throw error; }));

async function fetchFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const fonts = [
    '700 22px Outfit', '500 13px Outfit',
    '400 14px "Courier New"', '700 16px "Courier New"', '700 22px "Courier New"',
    '400 13px Inter', '500 13px Inter', '700 26px Inter',
    '400 12px Inter', '500 12px Inter', '400 11px Inter',
    'italic 400 13px Georgia', 'italic 400 15px Georgia', 'italic 400 15px Gelasio',
  ];
  await Promise.allSettled(fonts.map((f) => document.fonts.load(f)));
  await document.fonts.ready;
}

function fetchLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = logoSrc('light');
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load logo'));
    if (typeof img.decode === 'function') img.decode().then(() => resolve(img)).catch(() => {});
  });
}

/** A receipt break: a run of dots, the way a till slip separates its parts. */
function dots(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number) {
  ctx.save();
  ctx.fillStyle = billPalette.ink3;
  const gap = 5;
  for (let x = x1; x <= x2 - 1.5; x += gap) ctx.fillRect(x, y, 1.5, 1.5);
  ctx.restore();
}

/** Leaders from the end of a label out to just before the amount. */
function leaders(ctx: CanvasRenderingContext2D, from: number, to: number, y: number) {
  ctx.save();
  ctx.fillStyle = billPalette.ink3;
  ctx.globalAlpha = 0.55;
  for (let x = from; x < to - 2; x += 4) ctx.fillRect(x, y - 3, 1.5, 1.5);
  ctx.restore();
}

/**
 * Paints the bill as one receipt. Measured in two passes so the height is the
 * drawing, not a guess. 400px logical, 2x, long side capped at 2400.
 */
export async function paintBill(bill: Bill): Promise<HTMLCanvasElement> {
  const [, logo] = await Promise.all([loadFonts(), loadLogo()]);

  const width = 400;
  const pad = 32;
  const right = width - pad;

  const draw = (ctx: CanvasRenderingContext2D): number => {
    let y = 28;
    ctx.textAlign = 'center';
    ctx.drawImage(logo, (width - 200) / 2, y, 200, 67);
    y += 67 + 10;
    ctx.font = 'italic 400 13px Georgia, Gelasio, serif';
    ctx.fillStyle = billPalette.ink2;
    ctx.fillText(siteConfig.tagline, width / 2, y + 13);
    y += 18 + 10;
    ctx.fillStyle = billPalette.gold;
    ctx.fillRect(width / 2 - 14, y, 28, 1.5);
    y += 22;

    // Bill on the left, the code on the right, the way a receipt numbers itself.
    // One line: the word, then the number and the date together on the right.
    ctx.textAlign = 'left';
    ctx.font = '600 13px Outfit, sans-serif';
    ctx.fillStyle = billPalette.ink;
    ctx.fillText(adminCopy.bill.heading.toUpperCase(), pad, y + 13);
    ctx.textAlign = 'right';
    ctx.font = '400 11px Inter, sans-serif';
    ctx.fillStyle = billPalette.ink3;
    ctx.fillText(`${bill.code}   ·   ${bill.date}`, right, y + 13);
    y += 20 + 18;

    // Just the name. No phone, no pincode: those stay in the order book.
    const who = bill.name?.trim();
    if (who) {
      ctx.textAlign = 'left';
      ctx.font = '400 11px Inter, sans-serif';
      ctx.fillStyle = billPalette.ink3;
      ctx.fillText(adminCopy.bill.for, pad, y + 11);
      ctx.font = '700 16px Inter, sans-serif';
      ctx.fillStyle = billPalette.ink;
      let nameLine = '';
      let nameY = y + 32;
      for (const word of who.split(/\s+/)) {
        if (nameLine && ctx.measureText(`${nameLine} ${word}`).width > right - pad) {
          ctx.fillText(nameLine, pad, nameY);
          nameY += 21;
          nameLine = '';
        }
        // Names usually wrap at spaces; an unusually long token still fits.
        for (const character of `${nameLine ? ' ' : ''}${word}`) {
          if (nameLine && ctx.measureText(nameLine + character).width > right - pad) {
            ctx.fillText(nameLine.trim(), pad, nameY);
            nameY += 21;
            nameLine = '';
          }
          nameLine += character;
        }
      }
      ctx.fillText(nameLine.trim(), pad, nameY);
      y = nameY + 8;
    }
    y += 12;
    dots(ctx, pad, right, y);
    y += 24;

    // The red slip's type: one plain receipt face, same weight, for the item and its price.
    const slip = '14px "Courier New", ui-monospace, Menlo, monospace';
    for (const line of bill.lines) {
      const label = `${line.quantity}×  ${line.name}`;
      const size = line.sample
        ? adminCopy.bill.sampleRate
        : line.rate == null
          ? line.detail
          : adminCopy.bill.each(line.detail, line.quantity, formatMoney(line.rate));
      ctx.textAlign = 'left';
      ctx.font = `400 ${slip}`;
      ctx.fillStyle = billPalette.ink;
      ctx.fillText(label, pad, y + 14);
      ctx.fillText(size, pad, y + 32);
      ctx.textAlign = 'right';
      const amount = line.amount == null ? '—' : formatMoney(line.amount);
      ctx.fillText(amount, right, y + 14);
      const nameEnd = pad + ctx.measureText(label).width;
      const amountWidth = ctx.measureText(amount).width;
      leaders(ctx, nameEnd + 12, right - amountWidth - 10, y + 14);
      y += 44;
    }

    y += 4;
    dots(ctx, pad, right, y);
    y += 22;

    const slipFace = '14px "Courier New", ui-monospace, Menlo, monospace';
    const row = (label: string, value: string, color: string = billPalette.ink) => {
      ctx.textAlign = 'left';
      ctx.font = `400 ${slipFace}`;
      ctx.fillStyle = billPalette.ink;
      ctx.fillText(label, pad, y + 14);
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.fillText(value, right, y + 14);
      y += 24;
    };
    for (const sum of bill.sums) row(...sumRow(sum));

    y += 10;
    ctx.textAlign = 'left';
    ctx.font = '700 16px "Courier New", ui-monospace, Menlo, monospace';
    ctx.fillStyle = billPalette.ink;
    ctx.fillText(`${adminCopy.bill.total.toUpperCase()} :`, pad, y + 18);
    ctx.textAlign = 'right';
    ctx.font = '700 18px "Courier New", ui-monospace, Menlo, monospace';
    ctx.fillText(formatMoney(bill.total), right, y + 18);
    y += 34;

    // Paid sits on its own, centred, in the receipt face. Not a footnote on the right.
    y += 8;
    ctx.textAlign = 'center';
    ctx.font = '700 13px "Courier New", ui-monospace, Menlo, monospace';
    ctx.fillStyle = bill.payment.kind === 'paid' ? billPalette.saving : billPalette.ink2;
    ctx.fillText(statusText(bill).toUpperCase(), width / 2, y + 14);
    y += 30;

    dots(ctx, pad, right, y);
    y += 26;
    ctx.textAlign = 'center';
    ctx.font = 'italic 400 15px Georgia, Gelasio, serif';
    ctx.fillStyle = billPalette.ink2;
    ctx.fillText(adminCopy.bill.thanks[0], width / 2, y + 15);
    ctx.fillText(adminCopy.bill.thanks[1], width / 2, y + 36);
    y += 44;
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = billPalette.ink3;
    ctx.fillText(adminCopy.bill.site, width / 2, y + 12);
    return y + 26;
  };

  const measure = document.createElement('canvas').getContext('2d')!;
  const height = Math.ceil(draw(measure));
  let scale = 2;
  if (height * scale > 2400) scale = Math.max(1.5, 2400 / height);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = billPalette.paper;
  ctx.fillRect(0, 0, width, height);
  draw(ctx);
  return canvas;
}

function sumRow(sum: BillSum): [string, string, string?] {
  const copy = adminCopy.bill;
  if (sum.kind === 'items') return [copy.items, formatMoney(sum.amount), billPalette.ink];
  if (sum.kind === 'coupon') {
    return sum.saving != null
      ? [`${copy.coupon} ${sum.code}`, `−${formatMoney(sum.saving)}`, billPalette.saving]
      : [`${copy.coupon} ${sum.code}`, copy.couponApplied, billPalette.ink2];
  }
  if (sum.kind === 'deliveryOther') return [copy.deliveryOther, `+${formatMoney(sum.amount)}`];
  if (sum.kind === 'adjusted') return [copy.adjusted, `−${formatMoney(sum.amount)}`];
  if (sum.kind === 'deliverySatara') return [copy.deliverySatara, copy.free];
  return ['', ''];
}

function statusText(bill: Bill): string {
  const copy = adminCopy.bill;
  if (bill.payment.kind === 'paid') return copy.paid;
  if (bill.payment.kind === 'freeSample') return copy.freeSamples;
  if (bill.payment.kind === 'part') return copy.partPaid(formatMoney(bill.payment.paid), formatMoney(bill.payment.due));
  return copy.notPaid;
}
