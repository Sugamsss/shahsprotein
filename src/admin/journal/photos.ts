import { useEffect, useState } from 'react';
import { signPhotos } from '../api';

// Journal photos: made small on the phone before upload (a 12 MP photo is 4 MB; 1600 px
// WebP is about 200 KB), and shown through short-lived links, because the bucket is private.

const MAX_SIDE = 1600;

/** The photo turned the right way up, at most 1600 px on its long side, as WebP (or JPEG where WebP can't be made). */
export const shrinkPhoto = async (file: Blob): Promise<{ blob: Blob; ext: 'webp' | 'jpg'; width: number; height: number }> => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp', width, height };
  const jpeg = await encode('image/jpeg', 0.85);
  if (!jpeg) throw new Error('Could not encode');
  return { blob: jpeg, ext: 'jpg', width, height };
};

// Signed links last an hour; one is used again until 5 minutes before it runs out.
const LINK_SECONDS = 3600;
const links = new Map<string, { url: string; until: number }>();
const waiting = new Map<string, Promise<void>>();

const fresh = (path: string) => {
  const link = links.get(path);
  return link && link.until > Date.now() ? link.url : null;
};

const sign = (paths: string[]): Promise<void> => {
  const missing = paths.filter((p) => !fresh(p) && !waiting.has(p));
  if (missing.length) {
    const call = signPhotos(missing, LINK_SECONDS).then((signed) => {
      const until = Date.now() + (LINK_SECONDS - 300) * 1000;
      for (const [path, url] of Object.entries(signed)) links.set(path, { url, until });
    }).catch(() => undefined).finally(() => { for (const p of missing) waiting.delete(p); });
    for (const p of missing) waiting.set(p, call);
  }
  return Promise.all(paths.map((p) => waiting.get(p)).filter(Boolean)).then(() => undefined);
};

/** Links for these photos, by path, filled in as they're signed. */
export const usePhotoLinks = (paths: string[]): Record<string, string> => {
  const key = paths.join('|');
  const read = () => Object.fromEntries(paths.map((p) => [p, fresh(p)]).filter(([, url]) => url)) as Record<string, string>;
  const [shown, setShown] = useState<Record<string, string>>(read);
  useEffect(() => {
    let live = true;
    setShown(read());
    if (paths.length) void sign(paths).then(() => { if (live) setShown(read()); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
};
