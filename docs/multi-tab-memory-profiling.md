# Multi-tab memory profiling protocol

The current multi-tab implementation keeps each DocumentView mounted and hides inactive panels. Each tab owns a PDF.js viewer/controller. This protocol determines whether memory growth is expected document retention or an actual leak before changing lifecycle behavior.

## Test inputs

Use the same fixed set for every run:
- Small text PDF (under 5 MB)
- Typical mixed-content PDF (20–50 MB)
- Large scanned PDF (100–300 MB, preferably 200+ pages)
- Annotation-heavy PDF

Record the SHA-256 and file size of each test document so runs are comparable.

## Procedure

1. Start a fresh OpenPDF process and wait 60 seconds after the initial window settles.
2. Record baseline memory for the OpenPDF process and its WebView2 child processes.
3. Open 1, 5, 10, then (if practical) 20 PDFs, including repeated large/scanned documents.
4. After each step, wait 60 seconds and record process private bytes, working set, process count, handle count, and GPU memory where available.
5. Switch through every tab and scroll several pages to ensure each viewer has rendered.
6. Leave the app idle for 2 minutes and record memory again.
7. Close tabs one at a time, waiting 30 seconds after each close; record whether memory falls or stabilizes.
8. Repeat from a fresh process at least three times.
9. Compare with a control run that opens and closes the same documents sequentially in a single tab.

## Interpretation

- Working set alone is not sufficient: Windows may retain freed pages in the process working set. Prefer private bytes/commit and process-tree measurements.
- Separate the main OpenPDF process from WebView2 renderer/GPU processes.
- Distinguish retained PDF document data from detached canvases, event listeners, workers, and other resources that should have been released.
- A rising value that plateaus may be normal caching; continuous growth across repeated open/close cycles is stronger evidence of a leak.
- Capture a process dump or profiler trace before concluding that a specific object is leaking.

## Decision gate

Do not unload inactive PDF documents solely to reduce a single working-set reading. If measurements show material growth, design a suspend/resume path that preserves per-tab page, zoom, scroll, search, annotations, and undo/redo state. Verify that resuming a tab does not lose edits or create duplicate PDF.js workers.
