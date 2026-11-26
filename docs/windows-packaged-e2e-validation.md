# Windows packaged-app validation plan

This checklist validates the installed Windows application, not just the source-level test suite or installer build.

## Test environment

Record before each run:
- Windows edition, version, and build (Windows 10/11)
- OpenPDF version, installer type (NSIS/MSI), and commit SHA
- WebView2 Runtime version
- Whether OpenPDF was already installed and whether this is an upgrade

Use disposable test PDFs: a small text PDF, a multi-page PDF, a large/scanned PDF, a password-protected PDF, and a PDF with annotations.

## Installation and shell integration

- [ ] Install using the NSIS installer.
- [ ] Repeat on a clean VM using the MSI installer.
- [ ] Confirm OpenPDF appears in Windows Settings > Apps > Default apps and in the PDF file's Open with list.
- [ ] Confirm installation does not silently change the user's default PDF app.
- [ ] Select OpenPDF through Open with and verify the selected PDF opens.
- [ ] Uninstall and verify the app is removed without deleting user documents.

## Single-instance and file routing

- [ ] Launch OpenPDF with sample-a.pdf from File Explorer.
- [ ] While it remains open, double-click sample-b.pdf.
- [ ] Expected: the existing window is focused and sample-b.pdf opens in a new tab; no second window/process is created.
- [ ] Repeat using Open with > OpenPDF.
- [ ] Select two or more PDFs in Explorer and open them together.
- [ ] Expected: each PDF opens in its own tab in the existing window.
- [ ] Repeat with paths containing spaces and non-ASCII characters.
- [ ] Repeat when OpenPDF is busy opening or saving another document; verify requests are not silently lost.
- [ ] Minimize OpenPDF, then launch another PDF; verify the existing window is restored and focused.
- [ ] Close OpenPDF, then launch it once with multiple PDF arguments; verify every document opens in argument order.
- [ ] Include a missing/unreadable PDF between valid files; verify valid files still open and the error names only failed reads.
- [ ] Queue another PDF while the first picker/load is pending; verify it creates a new tab and preserves the first document.

## Tabs, document lifecycle, and editing

- [ ] Drag one PDF into the window.
- [ ] Drag multiple PDFs into the window.
- [ ] Switch between tabs and verify page, zoom, scroll, search, and annotations remain per-document.
- [ ] Close a clean tab.
- [ ] Close a modified tab and choose Cancel; verify it remains open.
- [ ] Close a modified tab and choose Discard; verify it closes.
- [ ] Open a password-protected PDF and cancel the password prompt; verify no ghost filename remains.
- [ ] Attempt to open a corrupt/non-PDF file; verify a clear error and no misleading document state.

## Save, print, and shutdown

- [ ] Add an annotation, save, close, and reopen the PDF; verify the annotation persists.
- [ ] Cancel Save As; verify the document remains marked as modified.
- [ ] Print a multi-page PDF and verify page count/order.
- [ ] On the native-print prototype, press Ctrl+P on a 200-page PDF. Verify the Windows dialog appears before the preparation message. Cancel once and verify no output. Reopen it, choose Microsoft Print to PDF and pages 15 and 190, and verify the output contains only those pages in order.
- [ ] Repeat with an unsaved Ink, Highlight, and FreeText annotation on the selected pages. Verify the output includes the annotations while the original tab still shows unsaved changes. Check portrait and landscape pages, Current Page, and cancelling the Windows output-file prompt.
- [ ] Cancel an in-progress print preparation if possible; verify the app remains responsive.
- [ ] Exit with multiple modified tabs; verify each modified document is handled before shutdown.

## WebView2 scenarios

- [ ] Test on a Windows installation with WebView2 Runtime already present.
- [ ] Test on a clean supported Windows VM without a preinstalled Evergreen Runtime, using the installer/runtime deployment strategy selected for the release.
- [ ] Verify startup behavior and show a clear recovery path if WebView2 is unavailable.

## Results

For every failed or skipped item, record the test case, exact reproduction steps, expected/actual result, screenshot or log, and whether the failure is reproducible. Do not mark packaged Windows E2E as passed solely because CI produced an installer.
