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

## Planned boundaries
- src/app: application composition and global state.
- src/components: reusable UI components.
- src/features/document: open/close document lifecycle.
- src/features/viewer: page layout, zoom, scroll, and rendering.
- src/features/thumbnails: page thumbnail navigation.
- src/features/search: text search.
- src/services/pdf: PDF.js adapter and worker configuration.
- src/services/files: local file input and drag/drop.
- src-tauri/src: native commands and Windows integration.
- src-tauri/capabilities: explicit Tauri permissions.
- docs: contributor and technical documentation.

This is the intended direction, not a requirement to create every folder immediately. Add a module when a real feature needs it.

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

File-open handling must support cold start and warm start. This will be implemented and tested in a dedicated Windows integration phase.

## Dependency and licensing policy
- Prefer maintained upstream packages.
- Record direct dependencies and review transitive dependency changes.
- Preserve third-party license notices.
- The project is licensed under GPL-3.0. Check each dependency's license for compatibility before distributing the application.