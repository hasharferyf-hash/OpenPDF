$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$runtime = Join-Path $PSScriptRoot '../src-tauri/pdfium-runtime'
$archive = Join-Path $runtime 'pdfium-win-x64.tgz'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
try {
    Invoke-WebRequest -Uri 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/8179/pdfium-win-x64.tgz' -OutFile $archive
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash -ne '836A77C9053F624839C66010CDDEA7B675628A36B8831D2330178BB169D241B6') {
        throw 'PDFium archive checksum mismatch'
    }
    tar.exe -xf $archive -C $runtime bin/pdfium.dll LICENSE VERSION licenses
    if ($LASTEXITCODE -ne 0) { throw 'Could not extract PDFium' }
} finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
}
