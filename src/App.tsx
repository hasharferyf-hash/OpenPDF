import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MessageDialog } from "./components/Dialogs";
import { DocumentView } from "./components/DocumentView";
import { TabStrip } from "./components/TabStrip";
import { I18nContext, initialLanguage, storeLanguage, translator, type Language } from "./i18n";
import { FileOperations } from "./services/files/operations";
import { readBatch, type FileBatch } from "./services/files/batch";
import { fromFiles, isDesktop, isPdfName, onNativeFileDrop, pickPdfs, readPaths, startupFilePaths } from "./services/files/platform";
import { DocumentTabs, type DocumentHandle, type DocumentStatus } from "./services/tabs";

export default function App() {
  const [documents] = useState(() => new DocumentTabs());
  const [operations] = useState(() => new FileOperations());
  const { tabs, activeId } = useSyncExternalStore(documents.subscribe, documents.getSnapshot);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startupHandled = useRef(false);
  const pendingOpenPaths = useRef<string[]>([]);
  const i18n = useMemo(() => ({ language, t: translator(language) }), [language]);
  const latest = useRef({ t: i18n.t, message });
  latest.current = { t: i18n.t, message };
  const blocked = useCallback(() => !!latest.current.message || documents.getSnapshot().tabs.some((tab) => tab.modal), [documents]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "he" ? "rtl" : "ltr";
  }, [language]);

  const register = useCallback((id: number, handle: DocumentHandle) => documents.register(id, handle), [documents]);
  const updateStatus = useCallback((id: number, status: DocumentStatus) => documents.update(id, status), [documents]);

  const openFiles = useCallback((source: () => Promise<FileBatch>) => operations.run(async () => {
    if (blocked()) return;
    try {
      const { files, failed } = await source();
      const current = documents.active;
      const handle = await current.ready;
      if (files.length) await handle.exitPresentation();
      // React's filename effect can lag behind a completed load and queue flush.
      let blank = handle.hasDocument() ? null : current;
      for (const file of files) {
        const tab = blank ?? documents.create();
        blank = null;
        await (await tab.ready).load(file);
      }
      if (failed.length) setMessage(latest.current.t("errorReadFiles", { names: failed.join(", ") }));
    } catch (error) {
      console.error(error);
      setMessage(latest.current.t("errorInvalid"));
    }
  }), [documents, operations, blocked]);

  const openPicker = useCallback(() => void openFiles(pickPdfs), [openFiles]);
  const openPaths = useCallback((paths: string[]) => {
    const pdfs = paths.filter(isPdfName);
    if (!pdfs.length) return setMessage(latest.current.t("errorNotPdf"));
    // Shell launches can arrive while a save/open dialog or another operation is active.
    // Queue them rather than draining and silently losing the native request.
    if (blocked() || operations.busy) {
      pendingOpenPaths.current.push(...pdfs);
      return;
    }
    void openFiles(() => readPaths(pdfs));
  }, [blocked, operations, openFiles]);

  useEffect(() => {
    const flush = () => {
      if (blocked() || operations.busy || !pendingOpenPaths.current.length) return;
      const paths = pendingOpenPaths.current.splice(0);
      openPaths(paths);
    };
    const stopOperations = operations.subscribe(flush);
    const stopDocuments = documents.subscribe(flush);
    flush();
    return () => {
      stopOperations();
      stopDocuments();
    };
  }, [blocked, documents, message, operations, openPaths]);

  const activate = useCallback((id: number) => operations.run(async () => {
    if (blocked() || id === documents.active.id) return;
    await (await documents.active.ready).exitPresentation();
    documents.activate(id);
  }), [blocked, documents, operations]);

  const newTab = useCallback(() => operations.run(async () => {
    if (blocked()) return;
    await (await documents.active.ready).exitPresentation();
    await documents.create().ready;
  }), [blocked, documents, operations]);

  const closeTab = useCallback((id: number) => operations.run(async () => {
    if (blocked()) return;
    const tab = documents.getSnapshot().tabs.find((entry) => entry.id === id);
    if (!tab) return;
    const handle = await tab.ready;
    if (handle.hasUnsavedChanges()) {
      await (await documents.active.ready).exitPresentation();
      documents.activate(id);
      if (!(await handle.confirmClose())) return;
    }
    await handle.exitPresentation();
    await handle.destroy();
    documents.remove(id);
  }), [blocked, documents, operations]);

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const keep = (unlisten: () => void) => disposed ? unlisten() : cleanups.push(unlisten);
    if (!startupHandled.current) {
      startupHandled.current = true;
      void startupFilePaths().then((paths) => paths.length && openPaths(paths)).catch(console.error);
      if (!isDesktop && import.meta.env.DEV) {
        const names = new URLSearchParams(location.search).getAll("file");
        if (names.length && names.every((name) => /^[\w.-]+$/.test(name))) {
          void openFiles(() => readBatch(names, async (name) => {
            const response = await fetch(`/${name}`);
            if (!response.ok) throw new Error("Could not load test PDF");
            return { name, data: new Uint8Array(await response.arrayBuffer()) };
          }, (name) => name));
        }
      }
    }
    void onNativeFileDrop({ onHover: setDragging, onDrop: openPaths }).then(keep, console.error);
    if (isDesktop) {
      // The native single-instance callback queues paths and emits a wake-up event.
      // Register first, then drain the queue to cover requests arriving during startup.
      void import("@tauri-apps/api/event").then(async ({ listen }) => {
        const unlisten = await listen("open-pdf-files", async () => {
          const { invoke } = await import("@tauri-apps/api/core");
          const paths = await invoke<string[]>("take_pending_open_files");
          if (paths.length) openPaths(paths);
        });
        keep(unlisten);
        const { invoke } = await import("@tauri-apps/api/core");
        const pending = await invoke<string[]>("take_pending_open_files");
        if (pending.length) openPaths(pending);
      }).catch(console.error);
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested((event) => {
          event.preventDefault();
          if (blocked()) return;
          void operations.run(async () => {
            if (await documents.confirmAll()) await getCurrentWindow().destroy();
          }).catch(console.error);
        }),
      ).then(keep, console.error);
    }
    return () => { disposed = true; cleanups.forEach((cleanup) => cleanup()); };
  }, [documents, operations, blocked, openFiles, openPaths]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (!["o", "t", "w", "tab", "pageup", "pagedown"].includes(key) && !/^[1-9]$/.test(key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (blocked() || operations.busy) return;
      if (key === "o") return openPicker();
      if (key === "t") return void newTab();
      if (key === "w") return void closeTab(documents.active.id);
      if (/^[1-9]$/.test(key)) {
        const current = documents.getSnapshot().tabs;
        const tab = current[key === "9" ? current.length - 1 : Number(key) - 1];
        if (tab) void activate(tab.id);
        return;
      }
      void activate(documents.adjacent(key === "pageup" || (key === "tab" && event.shiftKey) ? -1 : 1));
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      if (documents.hasUnsavedChanges() || operations.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKey, true);
    if (!isDesktop) window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [activate, blocked, closeTab, documents, newTab, openPicker, operations]);

  const toggleLanguage = useCallback(() => setLanguage((current) => {
    const next = current === "he" ? "en" : "he";
    storeLanguage(next);
    return next;
  }), []);

  return (
    <I18nContext.Provider value={i18n}>
      <div className="application" onDragOver={isDesktop ? undefined : (event) => {
        event.preventDefault(); setDragging(true);
      }} onDragLeave={isDesktop ? undefined : (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }} onDrop={isDesktop ? undefined : (event) => {
        event.preventDefault(); setDragging(false);
        if (blocked() || operations.busy) return;
        const pdfs = Array.from(event.dataTransfer.files).filter((file) => isPdfName(file.name) || file.type === "application/pdf");
        if (!pdfs.length) return setMessage(i18n.t("errorNotPdf"));
        void openFiles(() => fromFiles(pdfs));
      }}>
        {!documents.active.presenting && <TabStrip tabs={tabs} activeId={activeId}
          onActivate={(id) => void activate(id)} onClose={(id) => void closeTab(id)} onNew={() => void newTab()} />}
        {tabs.map((tab) => (
          <section key={tab.id} id={`document-panel-${tab.id}`} className="document-tab-panel"
            role="tabpanel" aria-labelledby={`document-tab-${tab.id}`} hidden={tab.id !== activeId}>
            <DocumentView id={tab.id} active={tab.id === activeId} language={language} operations={operations}
              onOpen={openPicker} onToggleLanguage={toggleLanguage} onReady={register} onStatus={updateStatus} />
          </section>
        ))}
        {dragging && <div className="drop-overlay"><div>{i18n.t("dropHere")}</div></div>}
        {message && <MessageDialog title={i18n.t("errorTitle")} message={message} onClose={() => setMessage(null)} />}
      </div>
    </I18nContext.Provider>
  );
}
