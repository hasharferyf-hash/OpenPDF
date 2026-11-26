# Contributing to OpenPDF

Thank you for considering a contribution. This project is organized so several contributors can work in parallel without editing the same areas unnecessarily.

## Before starting
1. Read docs/ARCHITECTURE.md and docs/ROADMAP.md.
2. Check Issues and active Pull Requests for existing work.
3. For a substantial change, open or claim an Issue before coding.
4. Ask before changing architecture, dependencies, licensing, or user-facing behavior.

## Work allocation
Issues should be small enough to review independently. Use these labels when available:
- area:ui — React components and styling.
- area:pdf-engine — PDF.js integration and document rendering.
- area:windows — Windows integration, file associations, installer.
- area:build — CI, packaging, release automation.
- area:docs — documentation.
- type:bug, type:feature, type:maintenance.
- status:in-progress, status:blocked.

Give each Issue one primary owner and a clear file/module boundary. Avoid assigning multiple contributors to the same files.

## Branch and pull request rules
- Do not commit directly to main.
- Create branches from the latest main.
- Use feat/name, fix/name, docs/name, or chore/name.
- Keep pull requests focused; do not combine unrelated changes.
- Open a Draft PR early when coordination or feedback is useful.
- Do not merge your own PR unless repository maintainers explicitly allow it.
- Update your branch if main changes during review.

## Local development
Requirements: Node.js LTS, npm, Rust stable with the MSVC toolchain, Microsoft C++ Build Tools, and Microsoft Edge WebView2.

    npm install
    pwsh -File scripts/prepare-pdfium.ps1
    npm run tauri dev

Run checks before opening a PR:

    npm run check
    npm run build
    cargo check --manifest-path src-tauri/Cargo.toml

## Code conventions
- TypeScript strict mode stays enabled.
- Prefer small, single-purpose React components.
- Keep PDF rendering and document state out of presentational components.
- Avoid adding dependencies for trivial functionality.
- Do not introduce network requests, telemetry, analytics, or cloud document processing without an approved Issue.
- Do not commit generated output, local PDFs, secrets, signing keys, or personal configuration.
- Preserve keyboard navigation, focus visibility, labels, and useful error messages.

## Commit messages
Use concise conventional-style messages, for example: feat(viewer): add page navigation; fix(pdf): release canvases after unmount; docs: clarify local setup; chore(ci): cache Rust dependencies.

## Pull requests
Explain the problem, solution, tests, and trade-offs. Complete the PR template. Include screenshots for UI changes and non-sensitive test-document details for PDF behavior changes. Never upload confidential PDFs.

## Licensing
By submitting a contribution, you agree that it is distributed under GNU GPL v3.0. Keep third-party notices and license obligations intact. See LICENSE.
