# Roadmap

This roadmap tracks implementation and release readiness. A checked implementation item means the corresponding code/configuration exists; it does not automatically mean every edge case has passed manual testing. Issues and pull requests remain the source of truth for ownership and active work.

## Phase 0 — Project foundation

- [x] Confirm repository and GPL-3.0 license.
- [x] Add contributor workflow and architecture documentation.
- [x] Add Tauri 2 + React + TypeScript + Vite application scaffold.
- [x] Add Windows GitHub Actions workflow.
- [x] Build Windows NSIS and MSI installer artifacts in CI.

## Phase 1 — PDF engine

- [x] Add Mozilla PDF.js and configure its worker.
- [x] Load a local PDF.
- [x] Render pages with continuous scrolling.
- [x] Handle password-protected and malformed documents in the PDF loading flow.
- [x] Clean up document, worker, and canvas resources.

## Phase 2 — Chrome-inspired viewer

- [x] Toolbar and page navigation, including direct page-number entry.
- [x] Zoom, fit-to-width, fit-to-page, and rotation.
- [x] Thumbnail sidebar and document outline/bookmarks.
- [x] Text selection and in-document search.
- [x] Drawing/ink, highlighting, and free-text annotations.
- [x] Undo/redo and save edited annotations into a PDF.
- [x] Save a copy, print, two-page view, presentation mode, and document properties.
- [x] Hebrew and English interface with RTL layout support.
- [x] Keyboard shortcuts.
- [x] Light theme (automatic, light, or dark).
- [ ] Accessibility review and keyboard/screen-reader pass.

## Phase 3 — Windows integration

- [x] Declare the .pdf file association in the Tauri bundle configuration.
- [x] Handle a PDF path supplied when the application starts (cold start).
- [ ] Verify actual installer registration and Windows Open with / default-app selection on clean Windows 10 and Windows 11 systems.
- [ ] Forward file-open requests to an already-running instance (warm start / single-instance routing).
- [ ] Verify install, upgrade, repair, and uninstall behavior.
- [x] Offer an installer with the offline WebView2 Runtime, a standard installer, and a portable ZIP.
- [ ] Verify the WebView2 offline installer and the portable build on a Windows machine without WebView2.

## Phase 4 — Quality and release

- [ ] Complete and record a manual test matrix for ordinary, large, scanned, malformed, Hebrew/RTL, and password-protected PDFs.
- [ ] Verify annotation editing, saving, closing, and reopening documents.
- [ ] Verify printing, memory use, and behavior with long documents.
- [ ] Review security permissions, PDF.js updates, and dependency licenses.
- [ ] Decide whether a portable distribution is practical and supported.
- [ ] Publish release notes and corresponding GPL-3.0 source for every binary release.

## Parallel work

Split work into Issues with one primary owner and a clear module/file boundary. Avoid assigning multiple contributors to the same files. Coordinate cross-cutting changes in an early Draft PR.
