# Architecture

## Project status
OpenPDF is at the foundation stage. The current UI is only a shell; PDF parsing and rendering are not implemented yet.

## Target stack
- Desktop shell: Tauri 2.
- Frontend: React + TypeScript + Vite.
- PDF engine: Mozilla PDF.js (pdfjs-dist).
- Primary target: Windows 10 and Windows 11.
- Package manager: npm.

The application is designed to work locally. Opening and rendering a document must not require uploading it or contacting a remote service.

## Module boundaries
- src/App.tsx: application composition, document lifecycle, keyboard shortcuts, dialogs.
- src/components: presentational UI (Toolbar, EditorBar, Sidebar, FindBar, Dialogs, Icon).
- src/i18n: Hebrew and English strings and the translation helper.
- src/services/pdf: the PDF.js adapter.
  - viewerController.ts wraps the PDF.js viewer (pages, zoom, rotation, spreads, search, annotation editor) and exposes plain state that React subscribes to.
  - documentInfo.ts reads metadata, the outline, and renders thumbnails.
  - print.ts rasterizes pages for the system print dialog.
- src/services/files: local file access (native dialogs and commands in the desktop app; file input and download in a plain browser).
- scripts/copy-pdfjs-assets.mjs: copies PDF.js CMaps, fonts, ICC profiles and WASM decoders into public/pdfjs at build time so everything works offline.
- src-tauri/src: native commands (`read_pdf`, `write_pdf`, `startup_file`).
- src-tauri/capabilities: explicit Tauri permissions.
- docs: contributor and technical documentation.

Add a module when a real feature needs it.

## Responsibility rules
- React components render UI and forward user intent.
- Feature modules own feature-specific state and behavior.
- services/pdf is the only frontend boundary that should directly depend on PDF.js.
- Rust/Tauri owns operating-system integration that cannot be safely or reliably handled by the webview.
- Native commands must validate inputs and expose the smallest possible API.
- No module should make network requests for document content.

## PDF rendering principles
- Render visible pages first and prioritize the current page.
- Do not render every page of a large document eagerly.
- Reuse rendered output where practical and release canvas and worker resources when documents close.
- Keep text selection and accessibility in mind; a canvas-only viewer is insufficient.
- Treat PDFs as untrusted input. Keep PDF.js current and avoid unnecessary native parsing.

## Windows integration
The installer should register OpenPDF as a PDF-capable application so it appears in Open with. Windows remains responsible for the user's default-app choice; the application must not silently overwrite it.

The installer registers the .pdf association (bundle.fileAssociations). A file passed on the command line is opened at startup (cold start). Each launch currently opens its own window; routing files to an already-running instance (warm start) is not implemented.

The native commands only accept paths with a .pdf extension, and writes only go to an absolute path chosen in the native save dialog.

## Dependency and licensing policy
- Prefer maintained upstream packages.
- Record direct dependencies and review transitive dependency changes.
- Preserve third-party license notices.
- The project is licensed under GPL-3.0. Check each dependency's license for compatibility before distributing the application.