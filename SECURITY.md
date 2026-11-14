# Security Policy

## Reporting a vulnerability
Please do not report exploitable vulnerabilities in public Issues.

Use GitHub's private vulnerability reporting feature if it is enabled for this repository. If it is unavailable, contact the repository owner privately through GitHub.

Include the affected version, reproduction steps, impact, and any proof of concept that can be shared safely.

## Security expectations
- PDF files are untrusted input.
- Do not add telemetry, remote document processing, or automatic uploads.
- Keep Tauri capabilities minimal.
- Do not commit secrets, certificates, signing keys, or private documents.
- Keep PDF.js and other parsing dependencies updated.