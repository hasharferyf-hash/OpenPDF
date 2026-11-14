// Prints the document by rasterizing every page with the "print" intent into a
// hidden container that only becomes visible in the print media (see styles.css).
import { AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist";

const PRINT_DPI = 150;
const PRINT_UNITS = PRINT_DPI / 72;
const CONTAINER_ID = "print-container";

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
    const canvas = document.createElement("canvas");
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      if (signal?.aborted) {
        cleanup();
        return null;
      }
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
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
      canvas.width = Math.floor(viewport.width * PRINT_UNITS);
      canvas.height = Math.floor(viewport.height * PRINT_UNITS);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available");
      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      await page.render({
        canvas,
        transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
        viewport,
        intent: "print",
        annotationMode: AnnotationMode.ENABLE_STORAGE,
        printAnnotationStorage,
      }).promise;
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
    canvas.width = canvas.height = 0;
    if (signal?.aborted) {
      cleanup();
      return null;
    }
    document.head.append(pageStyle);
    document.body.append(container);
    return () => {
      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
