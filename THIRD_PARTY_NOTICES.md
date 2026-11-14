# Third-party notices

OpenPDF is distributed under GPL-3.0 and bundles the following components.

| Component | License | Use |
| --- | --- | --- |
| [PDF.js](https://github.com/mozilla/pdf.js) (pdfjs-dist), including its CMaps, standard fonts, ICC profiles and WASM decoders (OpenJPEG, JBIG2, qcms, QuickJS) | Apache-2.0 (bundled resources carry their own notices in `pdfjs/` and `pdfjs/wasm/LICENSE_*`) | PDF parsing, rendering, search, annotation editing |
| [Tauri](https://tauri.app) and its dialog / opener plugins | MIT or Apache-2.0 | Desktop shell and native integration |
| [React](https://react.dev) | MIT | User interface |

The full license texts ship with each package in `node_modules` / the Cargo registry, and the PDF.js license is copied next to its resources at build time.
