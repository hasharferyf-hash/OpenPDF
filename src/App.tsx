import { useRef, useState } from "react";
import PdfViewer from "./components/PdfViewer";

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  function acceptFile(candidate?: File) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".pdf") && candidate.type !== "application/pdf") {
      setFileError("Please choose a PDF file.");
      return;
    }
    setFileError(null);
    setFile(candidate);
  }

  return (
    <main className="app-shell">
      <header className="toolbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">▤</span><span>OpenPDF</span></div>
        <div className="toolbar-actions">
          {file && <span className="document-name" title={file.name}>{file.name}</span>}
          <button className="open-button" onClick={() => inputRef.current?.click()}>
            {file ? "Open another PDF" : "Open PDF"}
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              acceptFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      {file ? (
        <PdfViewer key={file.name + file.size + file.lastModified} file={file} />
      ) : (
        <section
          className={"workspace " + (isDragging ? "workspace--dragging" : "")}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            acceptFile(event.dataTransfer.files[0]);
          }}
        >
          <div className="welcome-card">
            <div className="document-icon" aria-hidden="true">PDF</div>
            <h1>Open a PDF</h1>
            <p>Choose a document or drag it into this window.</p>
            <button className="primary-button" onClick={() => inputRef.current?.click()}>Open file</button>
            {fileError && <p className="file-error" role="alert">{fileError}</p>}
            <p className="phase-note">Documents are opened locally on this device.</p>
          </div>
        </section>
      )}
    </main>
  );
}
