# Architecture

## Project status

OpenPDF is a functional Windows PDF viewer implementation built on Tauri 2, React, TypeScript, Vite, and Mozilla PDF.js. The application is local-first: PDF files are opened and processed on the user's computer; document contents are not uploaded to a service.

The repository is still undergoing validation and release hardening. A successful CI build confirms compilation, automated checks, native tests, and installer generation; it does not replace testing with representative PDFs on supported Windows versions.

## Target stack

- Desktop shell and operating-system integration: Tauri 2 with Rust.
- Frontend: React 19 + TypeScript 5.7 + Vite 6.
- PDF engine: Mozilla PDF.js (pdfjs-dist).
- Primary target: Windows 10 and Windows 11.
- Package manager: npm.
- Windows web rendering: Microsoft Edge WebView2 Runtime, required by Tauri on Windows.

## Implemented application capabilities

The current implementation includes:

- Continuous PDF page rendering, text selection, clickable links, and password-protected document handling.
- Page navigation, zoom, fit-to-page, fit-to-width, rotation, and two-page spread mode.
- Thumbnail and document-outline sidebars.
- Text search, including case-sensitive and whole-word options.
- PDF.js annotation editing for drawing/ink, highlighting, and free text, with undo/redo and save-to-PDF support.
- Save a copy, printing, document properties, and presentation mode.
- Hebrew and English UI strings with right-to-left layout support.
- Local file selection, drag-and-drop, startup file-path handling, and native save/open operations.

The feature list describes implemented code paths. Individual behaviors, edge cases, and accessibility still require ongoing manual verification.

## Module boundaries

- src/App.tsx: tab composition, multi-file selection/drop, window-wide shortcuts, and unsaved-change checks across every tab on application exit.
- src/services/tabs.ts: stable tab identities, selection, neighboring-tab behavior, readiness and close-all confirmation.
- src/components/DocumentView.tsx: one mounted document session per tab, with its own viewer, annotation/undo history, page/zoom/scroll, search, sidebar and dialogs. Inactive sessions stay mounted but are hidden; their editor shortcuts are suspended. Closing a tab destroys its worker and DOM listeners.
- src/components: presentational UI (toolbar, editor bar, sidebar, find bar, dialogs, and icons).
- src/i18n: Hebrew and English strings and translation helpers.
- src/services/pdf: the frontend adapter around PDF.js.
  - viewerController.ts: PDF.js viewer integration for pages, zoom, rotation, spreads, search, and annotation editing; exposes application state to React.
  - documentInfo.ts: document metadata, outline, and thumbnail rendering.
  - print.ts: prepares rendered pages for the system print dialog.
- src/services/files: desktop and browser file-access abstractions. The desktop path uses Tauri commands and native dialogs; browser development falls back to a file input and download.
- scripts/copy-pdfjs-assets.mjs: copies PDF.js CMaps, fonts, ICC profiles, and WASM resources into the frontend assets at build time.
- src-tauri/src: native Rust commands, including read_pdf, write_pdf, and startup_files.
- src-tauri/capabilities: explicit Tauri permissions.
- docs: architecture, roadmap, and contributor documentation.

## Responsibility rules

- React components render UI and forward user intent.
- Feature modules own feature-specific state and behavior.
- services/pdf is the frontend boundary that should directly depend on PDF.js.
- Rust/Tauri owns operating-system integration that cannot be handled safely or reliably in the webview.
- Native commands must validate inputs and expose the smallest practical API.
- File dialogs, document replacement, saving, and print preparation share an exclusive operation guard. Native close requests are blocked while one is active.
- Opening another PDF creates a tab instead of replacing an open document. Closing a dirty tab activates it and asks for confirmation; cancelling application exit preserves every tab, including previously confirmed ones.
- A completed save clears the unsaved flag only when the active document and serialized annotation hash still match the saved snapshot. Native writes flush a temporary file in the destination directory before atomically renaming it over the target.
- PDF document contents must remain local; do not add uploads, telemetry, or remote document processing without an explicitly approved project change.

## PDF rendering and security principles

- Render visible pages first and prioritize the current page.
- Avoid eagerly rendering every page of a large document.
- Reuse rendered output where practical and release canvas, worker, and document resources when documents close.
- Preserve text selection and accessibility; a canvas-only viewer is insufficient.
- Treat PDFs as untrusted input. Keep PDF.js updated and avoid unnecessary native parsing.
- Keep Tauri capabilities and the Content Security Policy restrictive.

Printing targets 150 DPI for ordinary documents. Raster preparation caps decoded page images at approximately 128 MiB in total, with a working canvas capped at 64 MiB and 8192 pixels per dimension. Long documents and oversized pages use a lower raster resolution to fit this budget; physical paper dimensions remain unchanged. These limits cover page rasters, not PDF.js, the native print spooler, or all WebView memory. Cancelling preparation interrupts the current render and releases temporary resources.

## Windows integration

The Tauri bundle declares a .pdf file association with the application role set to Viewer. Windows remains responsible for presenting the user's available-app/default-app choices; OpenPDF must not silently replace the user's default PDF application.

Cold and warm launches resolve all PDF arguments against the launching process's working directory. A second launch forwards paths to the existing instance, restores its minimized window, and focuses it. Native requests wait while another file operation or modal is active. Reusing an empty tab checks the live document controller because React's filename update may arrive after the next queued open starts.

Multi-file reads preserve selection order and isolate read failures: readable files open in separate tabs and a localized message names the unreadable files. Missing startup paths reach this same error handling instead of being silently filtered out.

The current Tauri configuration builds NSIS and MSI installers. Tauri on Windows requires Microsoft Edge WebView2 Runtime. The repository does not currently configure an explicitly bundled offline WebView2 Runtime; installation behavior on a machine without the runtime depends on Tauri's installer bootstrap configuration/defaults and may require internet access. If fully offline installation is a requirement, configure and test Tauri's offlineInstaller WebView2 install mode and account for the substantially larger installer.

The installer and file-association behavior must be verified on clean Windows 10 and Windows 11 systems, including install, upgrade, uninstall, Open with, and default-app selection.

## Dependency and licensing policy

- Prefer maintained upstream packages.
- Record direct dependencies and review transitive dependency changes.
- Preserve third-party license notices.
- The project is licensed under GPL-3.0. Check each dependency's license and notices before distributing the application.
