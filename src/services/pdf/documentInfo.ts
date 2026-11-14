import { PDFDateString, type PDFDocumentProxy } from "pdfjs-dist";

export interface DocumentInfo {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  created?: Date;
  modified?: Date;
  pdfVersion?: string;
  pageCount: number;
  /** First page size in PDF points (1/72 inch), after applying page rotation. */
  pageSize?: { width: number; height: number };
  fileSize?: number;
}

export interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineItem[];
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

const toDate = (value: unknown) => {
  const raw = text(value);
  return (raw && PDFDateString.toDateObject(raw)) || undefined;
};

export async function readDocumentInfo(doc: PDFDocumentProxy): Promise<DocumentInfo> {
  const [metadata, page, download] = await Promise.all([
    doc.getMetadata().catch(() => null),
    doc.getPage(1).catch(() => null),
    doc.getDownloadInfo().catch(() => null),
  ]);
  const info = (metadata?.info ?? {}) as Record<string, unknown>;
  const viewport = page?.getViewport({ scale: 1 });
  return {
    title: text(info.Title),
    author: text(info.Author),
    subject: text(info.Subject),
    keywords: text(info.Keywords),
    creator: text(info.Creator),
    producer: text(info.Producer),
    created: toDate(info.CreationDate),
    modified: toDate(info.ModDate),
    pdfVersion: text(info.PDFFormatVersion),
    pageCount: doc.numPages,
    pageSize: viewport ? { width: viewport.width, height: viewport.height } : undefined,
    fileSize: download?.length,
  };
}

export async function readOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const outline = await doc.getOutline().catch(() => null);
  const convert = (nodes: unknown): OutlineItem[] =>
    Array.isArray(nodes)
      ? nodes.map((node: { title: string; dest: string | unknown[] | null; items: unknown }) => ({
          title: node.title,
          dest: node.dest,
          items: convert(node.items),
        }))
      : [];
  return convert(outline);
}

export interface ThumbnailHandle {
  cancel(): void;
  /** Resolves to the page's height/width ratio once it is known. */
  ratio: Promise<number | null>;
  promise: Promise<void>;
}

/** Renders one page into the given canvas at the requested CSS width. */
export function renderThumbnail(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  extraRotation: number,
): ThumbnailHandle {
  let cancelled = false;
  let task: { cancel(): void } | null = null;
  let resolveRatio: (ratio: number | null) => void = () => undefined;
  const ratio = new Promise<number | null>((resolve) => (resolveRatio = resolve));
  const promise = (async () => {
    const page = await doc.getPage(pageNumber);
    if (cancelled) return resolveRatio(null);
    const rotation = (page.rotate + extraRotation) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    resolveRatio(base.height / base.width);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth * ratio) / base.width, rotation });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const renderTask = page.render({ canvas, viewport, intent: "display" });
    task = renderTask;
    try {
      await renderTask.promise;
    } catch (error) {
      if (!cancelled) throw error;
    }
  })();
  return {
    cancel() {
      cancelled = true;
      task?.cancel();
    },
    ratio,
    promise,
  };
}

export async function firstPageRatio(doc: PDFDocumentProxy, extraRotation: number): Promise<number> {
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + extraRotation) % 360 });
  return viewport.height / viewport.width;
}
