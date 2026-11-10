// Getting the sticker PDF into a chat, not just a chat window open.
//
// `https://wa.me/<number>?text=…` is a URL, and a URL carries text only. There
// is no parameter that attaches a file, so Send used to download the PDF and
// leave the attaching to a person. The one web path that hands a real file to
// another app is Web Share Level 2 (`navigator.share({ files })`), which opens
// the phone's own sheet: WhatsApp appears there and the PDF travels with the
// message. Everything here is a plain feature check plus the File itself, kept
// apart from the page so it can be tested without a browser.

/** The navigator bits the share path needs. Injectable so tests can fake them. */
export interface ShareHost {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}

/**
 * True only when this browser can put a PDF in the share sheet. A browser can
 * share text and still refuse files, and some refuse a file *type*, so the
 * probe uses a real `application/pdf` File, never a bare string.
 */
export function canSharePdf(host: ShareHost | undefined): boolean {
  if (!host || typeof host.share !== 'function' || typeof host.canShare !== 'function') return false;
  try {
    return host.canShare({ files: [probePdf()] });
  } catch {
    return false;
  }
}

/**
 * Exactly the bytes Download saves, as the file the sheet hands over. The name
 * is the one the person would have saved by hand, so a chat shows the batch.
 */
export function pdfFile(bytes: Uint8Array, fileName: string): File {
  // A fresh copy: pdf-lib's buffer may be a view over a larger ArrayBuffer.
  return new File([new Uint8Array(bytes)], fileName, { type: 'application/pdf' });
}

/** A sheet the person closed, which is not a failure and needs no fallback. */
export function shareCancelled(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

const probePdf = (): File => new File([new Uint8Array([0])], 'sticker.pdf', { type: 'application/pdf' });
