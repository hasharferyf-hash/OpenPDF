# Roadmap

This roadmap describes the intended order of work. Issues and pull requests are the source of truth for task ownership and current status.

## Phase 0 — Project foundation
- [x] Confirm repository and GPL-3.0 license.
- [x] Add contributor workflow and architecture documentation.
- [x] Add baseline Tauri + React + TypeScript application scaffold.
- [x] Add Windows CI build.
- [x] Confirm the first CI build succeeds on GitHub Actions.

## Phase 1 — PDF engine
- [x] Add PDF.js and configure its worker.
- [x] Load a local PDF from a file input.
- [x] Render pages with continuous scrolling.
- [x] Handle password-protected and malformed documents.
- [x] Clean up document, worker, and canvas resources.

## Phase 2 — Chrome-inspired viewer
- [x] Toolbar and page navigation.
- [x] Zoom, fit-to-width, fit-to-page, and rotation.
- [x] Thumbnail sidebar.
- [x] Text selection and search.
- [x] Drawing, highlighting and text annotations saved into the PDF.
- [x] Save a copy, print, two-page view, presentation mode, document properties.
- [x] Hebrew and English interface.
- [ ] Light theme (the viewer currently uses a Chrome-like dark toolbar).
- [x] Keyboard shortcuts.
- [ ] Accessibility pass.

## Phase 3 — Windows integration
- [x] Register PDF file association capability in the installer.
- [ ] Support Open with and Windows default-app selection.
- [x] Open a PDF passed on process startup.
- [ ] Handle files passed to an already-running instance.
- [ ] Verify install, upgrade, and uninstall behavior on Windows 10 and 11.

## Phase 4 — Quality and release
- [ ] Test large, scanned, Hebrew/RTL, malformed, and password-protected PDFs.
- [ ] Verify printing and memory behavior.
- [ ] Review security permissions and dependency licenses.
- [ ] Produce installer and portable distribution where supported.
- [ ] Publish release notes and corresponding source for each binary release.

## Parallel work
Split work into Issues with one primary owner and a clear file/module boundary. Avoid assigning two contributors to the same feature or files simultaneously. Cross-cutting changes require an early Draft PR and coordination in the Issue.