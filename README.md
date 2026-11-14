# OpenPDF

A lightweight, local-first PDF viewer for Windows, with an interface inspired by the built-in PDF viewer in Google Chrome.

OpenPDF is a desktop application built with Tauri 2, React, TypeScript, and Mozilla PDF.js. On Windows, Tauri displays the interface using Microsoft Edge WebView2 Runtime; OpenPDF is not a browser.

## Features

- Browser-style document tabs: open multiple PDFs together, keep each document's annotations, page, zoom, search and sidebar state, and close documents independently.
- Chrome-inspired toolbar with page navigation, direct page jump, zoom, fit-to-page, fit-to-width, and rotation.
- Continuous page view, thumbnail sidebar, and document outline/bookmarks.
- Find in document (Ctrl+F), including match count, case-sensitive search, and whole-word matching.
- Text selection, copy, and clickable links.
- Draw/ink, highlight, and add free text to pages; undo/redo; save annotations into the PDF.
- Light and dark themes, or automatic (follows Windows).
- Save a copy (Ctrl+S) and print (Ctrl+P).
- Two-page view, show/hide annotations, presentation mode (F5), and document properties.
- Password-protected PDF loading.
- Open a PDF through the file picker, drag-and-drop, or a file path passed at application startup.
- Hebrew and English interface with right-to-left layout support.
- Local document processing: PDF contents are not uploaded to a remote service.

Feature availability is implemented in the application code; compatibility and edge cases should still be validated with representative PDF files and supported Windows versions.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Open / save a copy / print | Ctrl+O / Ctrl+S / Ctrl+P |
| New tab / close tab | Ctrl+T / Ctrl+W |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab (or Ctrl+PageDown / Ctrl+PageUp) |
| Select tab 1–8 / last tab | Ctrl+1–8 / Ctrl+9 |
| Find, next / previous match | Ctrl+F, Enter / Shift+Enter |
| Zoom in / out / automatic | Ctrl++ / Ctrl+- / Ctrl+0 (or Ctrl+mouse wheel) |
| Rotate clockwise / counterclockwise | Ctrl+] / Ctrl+[ |
| Previous / next page | Left / Right arrow |
| First / last page | Home / End |
| Presentation mode | F5 (Esc to leave) |

## Windows and WebView2

Microsoft Edge WebView2 Runtime is required to run the Windows application. Many supported Windows installations already have the runtime, but it should not be assumed to exist on every target machine.

Each CI build produces three Windows packages:

| Package | WebView2 | Notes |
| --- | --- | --- |
| `OpenPDF-setup-with-WebView2` | Included (Microsoft's offline installer, about 130 MB extra) | Installs WebView2 only if it is missing. Works without an internet connection. |
| `OpenPDF-setup` (NSIS and MSI) | Not included | For computers that already have WebView2. If it is missing, the installer downloads it (internet required). |
| `OpenPDF-portable` (ZIP) | Not included | No installation: extract and run `OpenPDF.exe`. Settings are kept in an `OpenPDF-data` folder next to it. Uses the WebView2 already on the computer; if it is missing, OpenPDF says so and offers the download page. |

For a fully self-contained portable copy, place Microsoft's WebView2 *Fixed Version* runtime (the folder extracted from its `.cab` file, or the same folder renamed to `WebView2`) next to `OpenPDF.exe`; OpenPDF detects and uses it. Microsoft does not publish a stable download link for the fixed runtime, so CI does not bundle it.

OpenPDF declares a PDF file association in its installer configuration. Windows controls the user's Open with and default-app selection; OpenPDF should not silently change the default application.

## Download

Open the latest successful CI run under the repository's Actions tab and download one of the artifacts described above (`OpenPDF-setup-with-WebView2`, `OpenPDF-setup`, or `OpenPDF-portable`). CI artifacts are development builds, not signed or release-certified installers.

## Technology

- Tauri 2 and Rust for the desktop shell and native Windows integration.
- React 19, TypeScript, and Vite for the interface.
- Mozilla PDF.js for PDF parsing, rendering, search, and annotation editing.

## Development setup

Install Node.js 22, Rust stable with the MSVC toolchain, Microsoft C++ Build Tools, and Microsoft Edge WebView2 Runtime. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev
```

The interface can also be developed in a regular browser with npm run dev; in that mode, file access falls back to a browser file picker and download.

Run validation before submitting a pull request:

```sh
npm run check
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Contributing

Read CONTRIBUTING.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md before starting work. Use Issues to coordinate tasks and submit focused pull requests. Do not commit directly to main.

## License

OpenPDF is licensed under the GNU General Public License v3.0. See LICENSE. Third-party components and notices are listed in THIRD_PARTY_NOTICES.md.
