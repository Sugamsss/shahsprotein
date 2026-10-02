import type { Bill } from './bill';
import { paintBill } from './billPaint';

/**
 * The bill as it is sent: the paper coming out of a small printer, on the
 * brand's sky. The paper itself is paintBill. Drawn at 2x so it stays sharp.
 */
export async function paintBillScene(bill: Bill): Promise<Blob> {
  const url = URL.createObjectURL(await paintBill(bill));
  let slip: HTMLImageElement;
  try {
    slip = await load(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const width = 560;
  const slipW = 460;
  const slipH = slipW * (slip.height / slip.width);
  const py = 28;
  // The bill starts inside the slot. The lip, drawn after it, hides its top edge.
  const sy = py + 16;
  const height = Math.ceil(sy + slipH + 28);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#e7eef8');
  sky.addColorStop(1, '#f4f7fb');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const peach = ctx.createRadialGradient(width, 0, 0, width, 0, 420);
  peach.addColorStop(0, 'rgba(255, 226, 208, 0.85)');
  peach.addColorStop(1, 'rgba(255, 226, 208, 0)');
  ctx.fillStyle = peach;
  ctx.fillRect(0, 0, width, height);

  // The printer: a top face, a front face, and a slot set back into it.
  const px = 24;
  const pw = 512;
  const ph = 92;
  ctx.save();
  ctx.shadowColor = 'rgba(35, 39, 45, 0.20)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  rounded(ctx, px, py + 16, pw, ph - 16, 12);
  ctx.fillStyle = '#b7bcc2';
  ctx.fill();
  ctx.restore();

  // The top face, lighter, so the bar has a top and a front.
  ctx.beginPath();
  ctx.moveTo(px + 10, py + 22);
  ctx.lineTo(px + 26, py + 6);
  ctx.lineTo(px + pw - 26, py + 6);
  ctx.lineTo(px + pw - 10, py + 22);
  ctx.closePath();
  const top = ctx.createLinearGradient(0, py + 6, 0, py + 22);
  top.addColorStop(0, '#fbfcfd');
  top.addColorStop(1, '#d9dde2');
  ctx.fillStyle = top;
  ctx.fill();

  const front = ctx.createLinearGradient(0, py + 22, 0, py + ph);
  front.addColorStop(0, '#e7eaee');
  front.addColorStop(0.5, '#c5cacf');
  front.addColorStop(1, '#a3a9b0');
  ctx.fillStyle = front;
  rounded(ctx, px, py + 20, pw, ph - 20, 12);
  ctx.fill();
  // A thin highlight where the top meets the front.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 12, py + 21);
  ctx.lineTo(px + pw - 12, py + 21);
  ctx.stroke();

  // The slot, set back: a rim, then the dark opening.
  rounded(ctx, px + 30, py + 36, pw - 60, 20, 4);
  ctx.fillStyle = '#8e949b';
  ctx.fill();
  rounded(ctx, px + 33, py + 39, pw - 66, 14, 3);
  const recess = ctx.createLinearGradient(0, py + 39, 0, py + 53);
  recess.addColorStop(0, '#1c2026');
  recess.addColorStop(1, '#3a4048');
  ctx.fillStyle = recess;
  ctx.fill();

  // The bill is drawn last, starting inside the slot, so nothing sits between them.
  const sx = (width - slipW) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx - 4, py + 46, slipW + 8, height);
  ctx.clip();
  ctx.shadowColor = 'rgba(41, 45, 50, 0.16)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  ctx.drawImage(slip, sx, sy, slipW, slipH);
  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('scene failed'))), 'image/png');
  });
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
