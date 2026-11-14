# Architecture

## Project status
The foundation branch provides the Tauri 2 + React + TypeScript shell and Windows CI packaging. The `feat/pdfjs-viewer` branch introduces the first PDF.js-backed viewer: local file loading, continuous page layout, near-viewport canvas rendering, page navigation, and zoom. Until CI and manual Windows testing pass, treat this as an implementation in progress rather than a verified release.

## Target stack
- Desktop shell: Tauri 2.
- Frontend: React + TypeScript + Vite.
- PDF engine: Mozilla PDF.js (`pdfjs-dist`).
- Primary target: Windows 10 and Windows 11.
- Package manager: npm.

The application is designed to work locally. Opening and rendering a document must not require uploading it or contacting a remote service.

## Current module boundaries
- `src/App.tsx`: application shell and local file selection.
- `src/components/PdfViewer.tsx`: PDF document lifecycle, toolbar controls, page list, and page canvas rendering.
- `src/pdfjs-worker.d.ts`: TypeScript declaration for the Vite worker URL import.
- `src/styles.css`: application and viewer presentation.
- `src-tauri/src`: native commands and Windows integration (not implemented yet).
- `src-tauri/capabilities`: explicit Tauri permissions.
- `docs`: contributor and technical documentation.

## Responsibility rules
- React components render UI and forward user intent.
- PDF.js is used only in the viewer component for now; it should move behind a service adapter as the viewer grows.
- Rust/Tauri owns operating-system integration that cannot be safely or reliably handled by the webview.
- Native commands must validate inputs and expose the smallest possible API.
- No module should make network requests for document content.

## PDF rendering principles
- Render pages near the visible scroll area rather than rasterizing every page immediately.
- Prioritize the current page and keep navigation responsive.
- Cancel in-flight render tasks and release document/worker resources when documents close or change.
- Reuse rendered output where practical and release canvas resources when no longer needed.
- Keep text selection and accessibility in mind; a canvas-only viewer is insufficient for a finished product.
- Treat PDFs as untrusted input. Keep PDF.js current and avoid unnecessary native parsing.

## Windows integration
The installer should register OpenPDF as a PDF-capable application so it appears in Open with. Windows remains responsible for the user's default-app choice; the application must not silently overwrite it.

File-open handling must support cold start and warm start. This will be implemented and tested in a dedicated Windows integration phase.

## Dependency and licensing policy
- Prefer maintained upstream packages.
- Record direct dependencies and review transitive dependency changes.
- Preserve third-party license notices.
- The project is licensed under GPL-3.0. Check each dependency's license for compatibility before distributing the application.
