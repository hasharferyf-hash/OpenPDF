// Prints the document by rasterizing every page with the "print" intent into a
// hidden container that only becomes visible in the print media (see styles.css).
import { AnnotationMode, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";

const PRINT_DPI = 150;
const PRINT_UNITS = PRINT_DPI / 72;
const CONTAINER_ID = "print-container";
// Bound the decoded page bitmaps to roughly 128 MiB, plus one working canvas
// (at most 64 MiB). This is a raster budget, not a limit on total WebView memory.
const MAX_TOTAL_PIXELS = 32 * 1024 * 1024;
const MAX_PAGE_PIXELS = 16 * 1024 * 1024;
const MAX_CANVAS_DIMENSION = 8192;

function printScale(width: number, height: number, pageCount: number): number {
  const pixels = Math.min(MAX_PAGE_PIXELS, Math.max(1, Math.floor(MAX_TOTAL_PIXELS / pageCount)));
  return Math.min(
    PRINT_UNITS,
    Math.sqrt(pixels / (width * height)),
    pixels / Math.max(width, height),
    MAX_CANVAS_DIMENSION / width,
    MAX_CANVAS_DIMENSION / height,
  );
}

export interface PrintOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed")))),
  );
}

function loadImage(img: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Print page image failed to load"));
    img.src = url;
  });
}

/**
 * Renders every page for printing. Resolves to a function that opens the system
 * print dialog, or null when the job was cancelled.
 */
export async function printDocument(
  doc: PDFDocumentProxy,
  options: PrintOptions = {},
): Promise<(() => void) | null> {
  const { onProgress, signal } = options;
  document.getElementById(CONTAINER_ID)?.remove();
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  const pageStyle = document.createElement("style");
  const canvas = document.createElement("canvas");
  let renderTask: RenderTask | null = null;
  const cancelRender = () => renderTask?.cancel();
  signal?.addEventListener("abort", cancelRender, { once: true });
  const urls: string[] = [];
  // One named @page rule per distinct page size, so mixed portrait/landscape documents print correctly.
  const pageRules = new Map<string, string>();
  const cleanup = () => {
    container.remove();
    pageStyle.remove();
    urls.forEach((url) => URL.revokeObjectURL(url));
  };

  try {
    const printAnnotationStorage = doc.annotationStorage.print;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      if (signal?.aborted) {
        cleanup();
        return null;
      }
      const page = await doc.getPage(pageNumber);
      if (signal?.aborted) {
        cleanup();
        return null;
      }
      const viewport = page.getViewport({ scale: 1 });
      const scale = printScale(viewport.width, viewport.height, doc.numPages);
      const size = `${viewport.width}pt ${viewport.height}pt`;
      if (!pageRules.has(size)) {
        const name = `openpdf-size-${pageRules.size + 1}`;
        pageRules.set(size, name);
        // The first size is also the default for engines without named-page support.
        pageStyle.textContent +=
          (pageRules.size === 1 ? `@page { size: ${size}; margin: 0; }
` : "") +
          `@page ${name} { size: ${size}; margin: 0; }
`;
      }
      canvas.width = Math.max(1, Math.floor(viewport.width * scale));
      canvas.height = Math.max(1, Math.floor(viewport.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available");
      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      renderTask = page.render({
        canvas,
        transform: [scale, 0, 0, scale, 0, 0],
        viewport,
        intent: "print",
        annotationMode: AnnotationMode.ENABLE_STORAGE,
        printAnnotationStorage,
      });
      await renderTask.promise;
      renderTask = null;
      const url = URL.createObjectURL(await canvasToBlob(canvas));
      urls.push(url);
      const wrapper = document.createElement("div");
      wrapper.className = "print-page";
      wrapper.style.cssText = `page: ${pageRules.get(size)}; width: ${viewport.width}pt; height: ${viewport.height}pt;`;
      const img = document.createElement("img");
      await loadImage(img, url);
      wrapper.append(img);
      container.append(wrapper);
      page.cleanup();
      onProgress?.(pageNumber, doc.numPages);
    }
    if (signal?.aborted) {
      cleanup();
      return null;
    }
    document.head.append(pageStyle);
    document.body.append(container);
    return () => {
      window.addEventListener("afterprint", cleanup, { once: true });
      try {
        window.print();
      } catch (error) {
        window.removeEventListener("afterprint", cleanup);
        cleanup();
        throw error;
      }
    };
  } catch (error) {
    cleanup();
    if (signal?.aborted) return null;
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelRender);
    canvas.width = canvas.height = 0;
  }
}
