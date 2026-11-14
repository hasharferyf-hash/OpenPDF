import { useRef, useState } from "react";

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function acceptFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      window.alert("Please choose a PDF file.");
      return;
    }
    setFileName(file.name);
    // PDF.js document loading and rendering are introduced in Phase 1.
  }

  return (
    <main className="app-shell">
      <header className="toolbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">▤</span><span>OpenPDF</span></div>
        <div className="toolbar-status">PDF viewer</div>
      </header>
      <section
        className={"workspace " + (isDragging ? "workspace--dragging" : "")}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); acceptFile(event.dataTransfer.files[0]); }}
      >
        <div className="welcome-card">
          <div className="document-icon" aria-hidden="true">PDF</div>
          <h1>Open a PDF</h1>
          <p>Choose a document or drag it into this window.</p>
          <button className="primary-button" onClick={() => inputRef.current?.click()}>Open file</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => acceptFile(event.target.files?.[0])} />
          {fileName && <p className="selected-file">Selected: {fileName}</p>}
          <p className="phase-note">Project foundation is ready. PDF rendering is the next development phase.</p>
        </div>
      </section>
    </main>
  );
}