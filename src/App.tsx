import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ConfirmDialog, MessageDialog, PasswordDialog, ProgressDialog, PropertiesDialog } from "./components/Dialogs";
import { EditorBar } from "./components/EditorBar";
import { FindBar } from "./components/FindBar";
import { Icon } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import {
  I18nContext,
  initialLanguage,
  initialTheme,
  storeLanguage,
  storeTheme,
  translator,
  type Language,
  type ThemePreference,
} from "./i18n";
import {
  baseName,
  fromFile,
  isDesktop,
  isPdfName,
  onNativeFileDrop,
  openExternal,
  pickPdf,
  readPath,
  savePdf,
  setFullscreen,
  setNativeTheme,
  setWindowTitle,
  startupFilePath,
  type OpenedFile,
} from "./services/files/platform";
import { printDocument } from "./services/pdf/print";
import { PasswordCancelled, ViewerController } from "./services/pdf/viewerController";

interface CurrentFile {
  name: string;
  path?: string;
}

type Modal =
  | { kind: "message"; title: string; message: string }
  | { kind: "password"; id: number; wrong: boolean; resolve(password: string | null): void }
  | { kind: "confirm"; resolve(discard: boolean): void }
  | { kind: "print"; done: number; abort: AbortController }
  | { kind: "properties" };

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<ViewerController | null>(null);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [theme, setTheme] = useState<ThemePreference>(initialTheme);
  const [file, setFile] = useState<CurrentFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocus, setFindFocus] = useState(0);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const i18n = useMemo(() => ({ t: translator(language), language }), [language]);
  const { t } = i18n;

  // The PDF.js viewer is bound to its DOM container once, for the lifetime of the window.
  useEffect(() => {
    if (containerRef.current && viewerRef.current) {
      setController((existing) => existing ?? new ViewerController(containerRef.current!, viewerRef.current!));
    }
  }, []);

  useEffect(() => {
    // Handle for manual testing from the dev tools; never present in release builds.
    if (import.meta.env.DEV) (window as unknown as { __openpdf?: unknown }).__openpdf = controller;
  }, [controller]);

  const subscribe = useCallback((listener: () => void) => controller?.subscribe(listener) ?? (() => undefined), [controller]);
  const state = useSyncExternalStore(subscribe, () => controller?.getState() ?? null);
  const findState = useSyncExternalStore(subscribe, () => controller?.getFindState() ?? null);

  // Resolve "system" through the OS setting and keep following it while the app runs.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    void setNativeTheme(theme).catch(() => undefined);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "he" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    void setWindowTitle(file ? `${file.name} – OpenPDF` : "OpenPDF").catch(() => undefined);
  }, [file]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Callbacks registered once (native listeners) read the latest values through this ref.
  const latest = useRef({ controller, state, t, modal });
  latest.current = { controller, state, t, modal };

  const confirmDiscard = useCallback(async () => {
    if (!latest.current.controller?.hasUnsavedChanges()) return true;
    return new Promise<boolean>((resolve) =>
      setModal({
        kind: "confirm",
        resolve(discard) {
          setModal(null);
          resolve(discard);
        },
      }),
    );
  }, []);

  const showError = useCallback((title: string, message: string) => setModal({ kind: "message", title, message }), []);

  const openFile = useCallback(
    async (source: OpenedFile | (() => Promise<OpenedFile | null>)) => {
      const ctrl = latest.current.controller;
      const translate = latest.current.t;
      if (!ctrl || !(await confirmDiscard())) return;
      setLoading(true);
      try {
        const opened = typeof source === "function" ? await source() : source;
        if (!opened) return;
        setFindOpen(false);
        setFile(null);
        await ctrl.open(opened.data, (wrong) =>
          new Promise((resolve) =>
            setModal({
              kind: "password",
              id: Date.now(),
              wrong,
              resolve(password) {
                setModal(null);
                resolve(password);
              },
            }),
          ),
        );
        setFile({ name: opened.name, path: opened.path });
        ctrl.focus();
      } catch (error) {
        if (error instanceof PasswordCancelled || (error as Error)?.message?.includes("Password prompt cancelled")) return;
        console.error(error);
        showError(translate("errorTitle"), translate("errorInvalid"));
      } finally {
        setLoading(false);
      }
    },
    [confirmDiscard, showError],
  );

  const openPath = useCallback(
    (path: string) => {
      if (!isPdfName(path)) {
        showError(latest.current.t("errorTitle"), latest.current.t("errorNotPdf"));
        return;
      }
      void openFile(() => readPath(path));
    },
    [openFile, showError],
  );

  const openPicker = useCallback(() => void openFile(pickPdf), [openFile]);

  const save = useCallback(async () => {
    if (!controller?.document || !file) return;
    try {
      const bytes = await controller.getBytes();
      const saved = await savePdf(file.path ?? file.name, bytes);
      if (!saved) return;
      controller.markSaved();
      setToast(t("saved", { name: baseName(saved) }));
    } catch (error) {
      console.error(error);
      showError(t("download"), t("errorSave"));
    }
  }, [controller, file, showError, t]);

  const print = useCallback(async () => {
    const doc = controller?.document;
    if (!doc || latest.current.modal) return;
    controller.commitEdits();
    const abort = new AbortController();
    setModal({ kind: "print", done: 0, abort });
    try {
      // Let the progress dialog close before the system print dialog blocks the page.
      const ready = await printDocument(doc, {
        signal: abort.signal,
        onProgress: (done) => setModal((current) => (current?.kind === "print" ? { ...current, done } : current)),
      });
      setModal((current) => (current?.kind === "print" ? null : current));
      if (ready) setTimeout(ready, 50);
    } catch (error) {
      console.error(error);
      showError(t("print"), t("errorPrint"));
    }
  }, [controller, showError, t]);

  const setPresenting = useCallback(
    (enabled: boolean) => {
      if (!controller?.document && enabled) return;
      controller?.setPresenting(enabled);
      void setFullscreen(enabled).catch(() => undefined);
      if (enabled) controller?.focus();
    },
    [controller],
  );

  const openFind = useCallback(() => {
    if (!latest.current.state?.hasDocument) return;
    setFindOpen(true);
    setFindFocus((token) => token + 1);
  }, []);

  // Startup file ("Open with"), native drag and drop, and close confirmation.
  const startupHandled = useRef(false);
  useEffect(() => {
    if (!controller) return;
    const firstRun = !startupHandled.current;
    startupHandled.current = true;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const keep = (unlisten: () => void) => (disposed ? unlisten() : cleanups.push(unlisten));

    if (firstRun) {
      void startupFilePath()
        .then((path) => path && openPath(path))
        .catch(console.error);
    }
    void onNativeFileDrop({
      onHover: setDragging,
      onDrop: (paths) => {
        const path = paths.find(isPdfName) ?? paths[0];
        if (path) openPath(path);
      },
    }).then(keep, console.error);

    if (isDesktop) {
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested(async (event) => {
            if (!(await confirmDiscard())) event.preventDefault();
          }),
        )
        .then(keep, console.error);
    } else if (import.meta.env.DEV && firstRun) {
      // Development helper for the plain-browser build: /?file=sample.pdf (same origin only).
      const name = new URLSearchParams(location.search).get("file");
      if (name && /^[\w.-]+$/.test(name)) {
        void openFile(async () => {
          const response = await fetch(`/${name}`);
          return { name, data: new Uint8Array(await response.arrayBuffer()) };
        });
      }
    }
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [controller, confirmDiscard, openFile, openPath]);

  // Leaving fullscreen by other means (e.g. the browser's own Esc handling) ends the presentation.
  useEffect(() => {
    const onChange = () => !document.fullscreenElement && !isDesktop && controller?.setPresenting(false);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [controller]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (!controller) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      const viewer = current.state;
      if (!viewer || current.modal) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key;
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };

      if (ctrl && !event.altKey) {
        switch (key.toLowerCase()) {
          case "o":
            return run(openPicker);
          case "s":
            return run(() => void save());
          case "p":
            return run(() => void print());
          case "f":
            return run(openFind);
          case "=":
          case "+":
            return run(() => controller.zoomIn());
          case "-":
            return run(() => controller.zoomOut());
          case "0":
            return run(() => controller.setFit("auto"));
          case "]":
            return run(() => controller.rotate(90));
          case "[":
            return run(() => controller.rotate(-90));
          // Keep the webview from reloading or opening its own tools over the document.
          case "r":
          case "g":
          case "j":
          case "u":
            return event.preventDefault();
        }
        return;
      }

      if (key === "F3") return run(openFind);
      if (key === "F5") return run(() => setPresenting(!viewer.presenting));
      if (key === "F11" && viewer.presenting) return run(() => setPresenting(false));
      if (key === "Escape") {
        if (viewer.presenting) return run(() => setPresenting(false));
        if (isEditable(event.target)) return;
        if (viewer.tool !== "none" && !viewer.hasSelectedEditor) return run(() => controller.setTool("none"));
        return;
      }
      if (!viewer.hasDocument || isEditable(event.target) || viewer.tool !== "none" || event.altKey) return;
      switch (key) {
        case "ArrowLeft":
          return run(() => controller.previousPage());
        case "ArrowRight":
          return run(() => controller.nextPage());
        case "Home":
          return run(() => controller.goToPage(1));
        case "End":
          return run(() => controller.goToPage(viewer.pageCount));
        case "PageUp":
        case "ArrowUp":
          if (viewer.presenting) return run(() => controller.previousPage());
          return;
        case "PageDown":
        case "ArrowDown":
        case " ":
          if (viewer.presenting) return run(() => controller.nextPage());
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, openFind, openPicker, print, save, setPresenting]);

  // Ctrl+wheel zoom around the pointer, external links, and the webview's default context menu.
  useEffect(() => {
    const container = containerRef.current;
    if (!controller || !container) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const origin: [number, number] = [event.clientX, event.clientY];
      if (event.deltaY < 0) controller.zoomIn(origin);
      else if (event.deltaY > 0) controller.zoomOut(origin);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      const href = link?.getAttribute("href") ?? "";
      if (/^(https?:|mailto:)/i.test(href)) {
        event.preventDefault();
        void openExternal(href).catch(console.error);
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (isDesktop && !isEditable(event.target) && !window.getSelection()?.toString()) event.preventDefault();
    };
    const blockPageZoom = (event: WheelEvent) => (event.ctrlKey || event.metaKey) && event.preventDefault();
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("click", onClick);
    window.addEventListener("wheel", blockPageZoom, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("click", onClick);
      window.removeEventListener("wheel", blockPageZoom);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [controller]);

  // HTML drag and drop is only used outside the desktop shell (Tauri reports drops natively).
  const dropHandlers = isDesktop
    ? {}
    : {
        onDragOver: (event: React.DragEvent) => {
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event: React.DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files[0];
          if (!dropped) return;
          if (!isPdfName(dropped.name) && dropped.type !== "application/pdf") {
            showError(t("errorTitle"), t("errorNotPdf"));
            return;
          }
          void openFile(() => fromFile(dropped));
        },
      };

  const hasDocument = !!state?.hasDocument;
  const presenting = !!state?.presenting;

  return (
    <I18nContext.Provider value={i18n}>
      <main className={"app-shell" + (presenting ? " is-presenting" : "")} {...dropHandlers}>
        {controller && state && !presenting && (
          <Toolbar
            controller={controller}
            state={state}
            fileName={file?.name ?? "OpenPDF"}
            sidebarOpen={sidebarOpen}
            annotationsVisible={annotationsVisible}
            theme={theme}
            onThemeChange={(next) => {
              setTheme(next);
              storeTheme(next);
            }}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            onOpen={openPicker}
            onSave={() => void save()}
            onPrint={() => void print()}
            onFind={openFind}
            onProperties={() => setModal({ kind: "properties" })}
            onPresent={() => setPresenting(true)}
            onToggleAnnotations={() => setAnnotationsVisible((visible) => !visible)}
            onToggleLanguage={() => {
              const next = language === "he" ? "en" : "he";
              setLanguage(next);
              storeLanguage(next);
            }}
          />
        )}
        {controller && state && !presenting && <EditorBar controller={controller} state={state} />}

        <div className="workspace">
          {controller && state && hasDocument && sidebarOpen && !presenting && (
            <Sidebar controller={controller} state={state} />
          )}
          <div className="viewer-area">
            <div
              ref={containerRef}
              className={"viewer-container" + (annotationsVisible ? "" : " hide-annotations")}
              dir="ltr"
              tabIndex={0}
            >
              <div ref={viewerRef} className="pdfViewer" />
            </div>

            {controller && findState && findOpen && hasDocument && !presenting && (
              <FindBar
                controller={controller}
                findState={findState}
                focusToken={findFocus}
                onClose={() => {
                  setFindOpen(false);
                  controller.focus();
                }}
              />
            )}

            {!hasDocument && (
              <div className="welcome">
                <div className="welcome-card">
                  <div className="document-icon" aria-hidden="true">
                    PDF
                  </div>
                  <h1>OpenPDF</h1>
                  <p>{loading ? t("loading") : t("openHint")}</p>
                  <button type="button" className="primary-button" disabled={loading} onClick={openPicker}>
                    <Icon name="open" size={18} />
                    {t("openFile")}
                  </button>
                </div>
              </div>
            )}

            {presenting && (
              <button type="button" className="exit-present" onClick={() => setPresenting(false)}>
                {t("exitPresent")} (Esc)
              </button>
            )}
          </div>
        </div>

        {dragging && (
          <div className="drop-overlay">
            <div>{t("dropHere")}</div>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}

        {modal?.kind === "message" && (
          <MessageDialog title={modal.title} message={modal.message} onClose={() => setModal(null)} />
        )}
        {modal?.kind === "password" && <PasswordDialog key={modal.id} wrong={modal.wrong} onSubmit={modal.resolve} />}
        {modal?.kind === "confirm" && (
          <ConfirmDialog
            title={t("unsavedTitle")}
            message={t("unsavedPrompt")}
            confirmLabel={t("discard")}
            onConfirm={() => modal.resolve(true)}
            onCancel={() => modal.resolve(false)}
          />
        )}
        {modal?.kind === "print" && state && (
          <ProgressDialog
            message={t("preparingPrint", { done: modal.done, count: state.pageCount })}
            onCancel={() => {
              modal.abort.abort();
              setModal(null);
            }}
          />
        )}
        {modal?.kind === "properties" && controller && file && (
          <PropertiesDialog controller={controller} fileName={file.name} filePath={file.path} onClose={() => setModal(null)} />
        )}
      </main>
    </I18nContext.Provider>
  );
}
