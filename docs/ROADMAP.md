# Roadmap

This roadmap describes the intended order of work. Issues and pull requests are the source of truth for task ownership and current status.

## Phase 0 — Project foundation
- [x] Confirm repository and GPL-3.0 license.
- [x] Add contributor workflow and architecture documentation.
- [x] Add baseline Tauri + React + TypeScript application scaffold.
- [x] Add Windows CI build.
- [ ] Confirm the first CI build succeeds on GitHub Actions.

## Phase 1 — PDF engine
- [ ] Add PDF.js and configure its worker.
- [ ] Load a local PDF from a file input.
- [ ] Render pages with continuous scrolling.
- [ ] Handle password-protected and malformed documents.
- [ ] Clean up document, worker, and canvas resources.

## Phase 2 — Chrome-inspired viewer
- [ ] Toolbar and page navigation.
- [ ] Zoom, fit-to-width, fit-to-page, and rotation.
- [ ] Thumbnail sidebar.
- [ ] Text selection and search.
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

## Parallel work
Split work into Issues with one primary owner and a clear file/module boundary. Avoid assigning two contributors to the same feature or files simultaneously. Cross-cutting changes require an early Draft PR and coordination in the Issue.