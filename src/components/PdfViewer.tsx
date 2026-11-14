import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

type PdfViewerProps = {
  file: File;
};

type PdfPageProps = {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onVisible: (pageNumber: number) => void;
};

function PdfPage({ document, pageNumber, scale, onVisible }: PdfPageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setPageSize(null);
    setPageError(null);

    document.getPage(pageNumber).then((loadedPage) => {
      if (cancelled) return;
      const viewport = loadedPage.getViewport({ scale });
      setPage(loadedPage);
      setPageSize({ width: viewport.width, height: viewport.height });
    }).catch((error: unknown) => {
      if (!cancelled) setPageError(error instanceof Error ? error.message : "Unable to load this page.");
    });

    return () => { cancelled = true; };
  }, [document, pageNumber, scale]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setIsVisible(true);
          onVisible(pageNumber);
        }
      }
    }, { rootMargin: "900px 0px", threshold: 0.01 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [onVisible, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas || !isVisible) return;

    let renderTask: RenderTask | undefined;
    const viewport = page.getViewport({ scale });
    const pixelRatio = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      setPageError("This browser window cannot create a PDF canvas.");
      return;
    }

    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    });

    renderTask.promise.catch((error: unknown) => {
      if (!(error instanceof Error) || error.name !== "RenderingCancelledException") {
        setPageError("Unable to render this page.");
      }
    });

    return () => { renderTask?.cancel(); };
  }, [isVisible, page, scale]);

  return (
    <div
      ref={frameRef}
      className="page-frame"
      style={pageSize ? { width: pageSize.width, minHeight: pageSize.height } : undefined}
      data-page-number={pageNumber}
    >
      {pageError ? (
        <div className="page-error">Page {pageNumber}: {pageError}</div>
      ) : (
        <>
          {!page && <div className="page-loading">Loading page {pageNumber}…</div>}
          <canvas ref={canvasRef} className="pdf-page-canvas" aria-label={`PDF page ${pageNumber}`} />
        </>
      )}
    </div>
  );
}

export default function PdfViewer({ file }: PdfViewerProps) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1.15);
  const [currentPage, setCurrentPage] = useState(1);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    setLoading(true);
    setError(null);
    setDocument(null);
    setCurrentPage(1);
    setScale(1.15);

    file.arrayBuffer().then((buffer) => {
      if (cancelled) return;
      const task = getDocument({ data: new Uint8Array(buffer) });
      loadingTask = task;
      return task.promise.then((loadedDocument) => {
        if (cancelled) {
          void loadedDocument.destroy();
          return;
        }
        setDocument(loadedDocument);
        setLoading(false);
      });
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : "The selected file could not be opened.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [file]);

  function goToPage(pageNumber: number) {
    if (!document) return;
    const target = Math.max(1, Math.min(document.numPages, pageNumber));
    pageRefs.current[target - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentPage(target);
  }

  const handlePageVisible = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
  }, []);

  return (
    <section className="document-view">
      <div className="viewer-toolbar" aria-label="PDF controls">
        <div className="page-controls">
          <button className="tool-button" onClick={() => goToPage(currentPage - 1)} disabled={!document || currentPage <= 1} aria-label="Previous page">‹</button>
          <input
            className="page-number-input"
            aria-label="Current page"
            type="number"
            min={1}
            max={document?.numPages ?? 1}
            value={currentPage}
            disabled={!document}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 1) goToPage(value);
            }}
          />
          <span className="page-total">/ {document?.numPages ?? "—"}</span>
          <button className="tool-button" onClick={() => goToPage(currentPage + 1)} disabled={!document || currentPage >= document.numPages} aria-label="Next page">›</button>
        </div>
        <div className="zoom-controls">
          <button className="tool-button" onClick={() => setScale((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))} disabled={!document || scale <= 0.5} aria-label="Zoom out">−</button>
          <span className="zoom-value">{Math.round(scale * 100)}%</span>
          <button className="tool-button" onClick={() => setScale((value) => Math.min(3, Math.round((value + 0.1) * 10) / 10))} disabled={!document || scale >= 3} aria-label="Zoom in">+</button>
          <button className="tool-button fit-button" onClick={() => setScale(1.15)} disabled={!document} title="Reset zoom">Reset</button>
        </div>
      </div>

      <div className="pdf-workspace" ref={workspaceRef}>
        {loading && <div className="viewer-message">Opening {file.name}…</div>}
        {error && <div className="viewer-message viewer-error"><strong>Could not open PDF</strong><span>{error}</span></div>}
        {document && (
          <div className="pages-stack">
            {Array.from({ length: document.numPages }, (_, index) => (
              <div
                key={index + 1}
                ref={(element) => { pageRefs.current[index] = element; }}
                className="page-slot"
              >
                <PdfPage
                  document={document}
                  pageNumber={index + 1}
                  scale={scale}
                  onVisible={handlePageVisible}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
