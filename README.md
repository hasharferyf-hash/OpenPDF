# OpenPDF

A lightweight, clean and privacy-focused PDF viewer for Windows, inspired by the built-in PDF viewer in Google Chrome.

> **Current status: early development — PDF viewer implementation in progress.** The project foundation builds on Windows CI. The `feat/pdfjs-viewer` branch adds Mozilla PDF.js, local PDF loading, continuous page rendering, page navigation and zoom. These changes are awaiting CI validation and manual Windows testing; they are not yet a released or verified application.

## Implemented in the foundation
- Tauri 2 desktop shell with React, TypeScript and Vite.
- Chrome-inspired starting interface and local file selection/drop target.
- Windows installer build workflow.
- GPL-3.0 license and contributor documentation.

## Being implemented in the PDF viewer branch
- Mozilla PDF.js with a bundled worker.
- Open a local PDF from the file picker or drag and drop.
- Continuous scrolling with pages rendered near the visible area.
- Previous/next page navigation and direct page number entry.
- Zoom in/out and reset zoom.
- Loading and document/page error states.

## Not implemented yet
- In-document text search and text selection validation.
- Thumbnail sidebar, fit-to-width/page, rotation and keyboard shortcuts.
- Windows PDF registration, Open with, default-app selection, and command-line file-open routing.
- Full testing against large, scanned, Hebrew/RTL, malformed and password-protected PDFs.
- Release-quality installer and upgrade/uninstall verification on Windows 10 and 11.

## Goals
- Native Windows desktop application for Windows 10 and 11.
- Chrome-inspired, minimal PDF viewing experience.
- Local document handling; no cloud upload or telemetry.
- Fast navigation, thumbnails, zoom, text search, and printing.
- Windows integration so OpenPDF can appear in **Open with** and be selected as the default PDF app. The app must not silently change the user's default.

## Technology
- Tauri 2
- React + TypeScript + Vite
- Mozilla PDF.js (`pdfjs-dist`)
- Rust for native Windows integration

## Development setup
Install Node.js LTS, Rust stable with the MSVC toolchain, Microsoft C++ Build Tools, and Microsoft Edge WebView2. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

    npm install
    npm run tauri dev

Run validation before submitting a pull request:

    npm run check
    npm run build
    cargo check --manifest-path src-tauri/Cargo.toml

## Contributing
Read CONTRIBUTING.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md before starting work. Use Issues to coordinate tasks and submit focused pull requests. Do not commit directly to main.

## License
OpenPDF is licensed under the GNU General Public License v3.0. See LICENSE.
