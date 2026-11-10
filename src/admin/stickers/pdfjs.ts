// pdf.js is the biggest thing /admin/stickers loads, and it is only needed to
// paint the preview (the PDF itself is built with pdf-lib). Both the stage and
// the zoom render through it, and Create starts the load while the sheet is
// still being built, so the import never sits in front of the first preview.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type Pdfjs = typeof import('pdfjs-dist');

let loading: Promise<Pdfjs> | null = null;

/** The one pdf.js module instance, worker pointed at the bundled build. */
export const loadPdfjs = (): Promise<Pdfjs> => {
  loading ??= import('pdfjs-dist')
    .then((mod) => {
      if (!mod.GlobalWorkerOptions.workerSrc) mod.GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    })
    // A failed chunk download must not stick: the next Create tries again.
    .catch((err: unknown) => {
      loading = null;
      throw err;
    });
  return loading;
};

/** Best-effort warm-up: a Create tap can start this without waiting for it. */
export const warmPdfjs = (): void => {
  void loadPdfjs().catch(() => undefined);
};
