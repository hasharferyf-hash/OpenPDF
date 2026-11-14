# OpenPDF

A lightweight, clean and privacy-focused PDF viewer for Windows, inspired by the built-in PDF viewer in Google Chrome.

> **Status: early development.** The repository currently contains the desktop application foundation. PDF parsing and rendering are not implemented yet.

## Goals
- Native Windows desktop application for Windows 10 and 11.
- Chrome-inspired, minimal PDF viewing experience.
- Local document handling; no cloud upload or telemetry.
- Fast navigation, thumbnails, zoom, text search, and printing.
- Windows integration so OpenPDF can appear in **Open with** and be selected as the default PDF app.

## Technology
- Tauri 2
- React + TypeScript + Vite
- Mozilla PDF.js (planned PDF rendering engine)
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