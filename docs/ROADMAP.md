# Roadmap

This roadmap describes the intended order of work. Issues and pull requests are the source of truth for task ownership and current status.

## Phase 0 — Project foundation
- [x] Confirm repository and GPL-3.0 license.
- [x] Add contributor workflow and architecture documentation.
- [x] Add baseline Tauri + React + TypeScript application scaffold.
- [x] Add Windows CI build.
- [x] Confirm the first Windows CI build succeeds.
- [x] Produce initial Windows installer artifacts from CI.

## Phase 1 — PDF engine and first usable viewer
- [x] Add Mozilla PDF.js dependency and Vite worker URL integration (implementation added; CI validation pending).
- [x] Load a local PDF from a file input; drag-and-drop remains available on the empty screen.
- [x] Render document pages in a continuous scrolling layout, loading page canvases near the viewport.
- [ ] Validate PDF.js worker loading in the production Tauri build.
- [ ] Verify actual PDF rendering on Windows 10 and 11.
- [ ] Handle password-protected and malformed documents with clear user feedback.
- [ ] Verify cancellation and cleanup when documents are replaced or closed.
- [ ] Add robust tests for very large documents and unusual page sizes.

## Phase 2 — Chrome-inspired viewer
- [x] Basic page navigation and direct page number entry.
- [x] Basic zoom in/out and reset zoom.
- [ ] Fit-to-width and fit-to-page.
- [ ] Rotation.
- [ ] Thumbnail sidebar.
- [ ] Text selection and in-document search.
- [ ] Dark and light themes.
- [ ] Keyboard shortcuts and accessibility pass.

## Phase 3 — Windows integration
- [ ] Register PDF file association capability in the installer.
- [ ] Support Open with and Windows default-app selection.
- [ ] Open a PDF passed on process startup.
- [ ] Handle files passed to an already-running instance.
- [ ] Verify install, upgrade, and uninstall behavior on Windows 10 and 11.

## Phase 4 — Quality and release
- [ ] Test large, scanned, Hebrew/RTL, malformed, and password-protected PDFs.
- [ ] Verify printing and memory behavior.
- [ ] Review security permissions and dependency licenses.
- [ ] Produce installer and portable distribution where supported.
- [ ] Publish release notes and corresponding source for each binary release.

## Current validation boundary
A successful TypeScript/Vite/Tauri build proves that the code compiles and the installer can be packaged. It does **not** prove that PDF.js can load its worker or render real documents inside the Windows WebView. That requires a successful CI run plus manual testing with representative PDF files on Windows. The foundation CI workflow also listens for pull requests targeting the foundation branch so stacked feature PRs can be validated before the foundation is merged.

## Parallel work
Split work into Issues with one primary owner and a clear file/module boundary. Avoid assigning two contributors to the same feature or files simultaneously. Cross-cutting changes require an early Draft PR and coordination in the Issue.
