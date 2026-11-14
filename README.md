# OpenPDF

A lightweight, clean and privacy-focused PDF viewer for Windows, inspired by the built-in PDF viewer in Google Chrome.

It is a small native window (Tauri + the WebView2 runtime that ships with Windows) — not a browser, and a few megabytes instead of hundreds.

## Features
- Chrome-style toolbar: file name, page number with instant jump, zoom in/out with an editable zoom level, fit to page / fit to width, rotation.
- Thumbnail sidebar and document outline (bookmarks).
- Find in document (Ctrl+F) with match count, match case and whole words.
- Draw, highlight and add text on the page; undo/redo; changes are saved into the PDF as standard annotations.
- Save a copy (Ctrl+S) and print (Ctrl+P).
- Two-page view, show/hide annotations, presentation mode (F5), document properties.
- Password-protected documents, text selection and copy, clickable links.
- Open with a double click ("Open with" / default PDF app), from the command line, or by dragging a file into the window.
- Hebrew and English interface (right-to-left aware).
- Fully local: no uploads, no telemetry, no network access for documents.

### Keyboard shortcuts
| Action | Shortcut |
| --- | --- |
| Open / save a copy / print | Ctrl+O / Ctrl+S / Ctrl+P |
| Find, next / previous match | Ctrl+F, Enter / Shift+Enter |
| Zoom in / out / automatic | Ctrl++ / Ctrl+- / Ctrl+0 (or Ctrl+mouse wheel) |
| Rotate clockwise / counterclockwise | Ctrl+] / Ctrl+[ |
| Previous / next page | ← / → |
| First / last page | Home / End |
| Presentation mode | F5 (Esc to leave) |

## Download
Installers are built by GitHub Actions for every change: open the latest successful **CI** run under the *Actions* tab and download the `OpenPDF-Windows-installers` artifact.

## Technology
- Tauri 2 (Rust) for the window, native dialogs and Windows integration
- React + TypeScript + Vite for the interface
- Mozilla PDF.js for parsing, rendering, search and annotation editing

## Development setup
Install Node.js LTS, Rust stable with the MSVC toolchain, Microsoft C++ Build Tools, and Microsoft Edge WebView2. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

    npm install
    npm run tauri dev

The interface can also be developed in a regular browser with `npm run dev` (file access then falls back to a file picker and a download).

Run validation before submitting a pull request:

    npm run check
    npm run build
    cargo test --manifest-path src-tauri/Cargo.toml

## Contributing
Read CONTRIBUTING.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md before starting work. Use Issues to coordinate tasks and submit focused pull requests. Do not commit directly to main.

## License
OpenPDF is licensed under the GNU General Public License v3.0. See LICENSE. Third-party components are listed in THIRD_PARTY_NOTICES.md.
