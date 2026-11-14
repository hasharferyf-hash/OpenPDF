// The single frontend boundary that talks to PDF.js. React components consume
// the plain state exposed here and never import pdfjs-dist directly.
import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  AnnotationMode,
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import {
  EventBus,
  GenericL10n,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
  ScrollMode,
  SpreadMode,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";

GlobalWorkerOptions.workerSrc = workerUrl;

const assetUrl = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;

export type EditorTool = "none" | "ink" | "text" | "highlight";
export type FitMode = "page-width" | "page-fit";

export interface ViewerState {
  hasDocument: boolean;
  page: number;
  pageCount: number;
  scale: number;
  scaleValue: string;
  rotation: number;
  twoPages: boolean;
  tool: EditorTool;
  canUndo: boolean;
  canRedo: boolean;
  hasSelectedEditor: boolean;
  modified: boolean;
  presenting: boolean;
}

export interface FindState {
  current: number;
  total: number;
  notFound: boolean;
  pending: boolean;
}

export interface FindOptions {
  query: string;
  caseSensitive: boolean;
  entireWord: boolean;
}

export type PasswordPrompt = (wrongPassword: boolean) => Promise<string | null>;

export class PasswordCancelled extends Error {}
export class OpenCancelled extends Error {}

export interface SaveSnapshot {
  readonly document: PDFDocumentProxy;
  readonly annotationHash: string;
  readonly data: Uint8Array;
}

const TOOL_TO_MODE: Record<EditorTool, number> = {
  none: AnnotationEditorType.NONE,
  ink: AnnotationEditorType.INK,
  text: AnnotationEditorType.FREETEXT,
  highlight: AnnotationEditorType.HIGHLIGHT,
};

export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "#FFFF98",
  green: "#53FFBC",
  blue: "#80EBFF",
  pink: "#FFCBE6",
  red: "#FF4F5F",
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

interface EditorUIManager {
  updateParams(type: number, value: unknown): void;
  undo(): void;
  redo(): void;
  delete(): void;
  commitOrRemove(): void;
  currentLayer?: { endDrawingSession(isAborted: boolean): unknown } | null;
}

const INITIAL_STATE: ViewerState = {
  hasDocument: false,
  page: 1,
  pageCount: 0,
  scale: 1,
  scaleValue: "auto",
  rotation: 0,
  twoPages: false,
  tool: "none",
  canUndo: false,
  canRedo: false,
  hasSelectedEditor: false,
  modified: false,
  presenting: false,
};

const INITIAL_FIND: FindState = { current: 0, total: 0, notFound: false, pending: false };

export class ViewerController {
  readonly eventBus = new EventBus();
  readonly container: HTMLDivElement;
  private readonly linkService: PDFLinkService;
  private readonly findController: PDFFindController;
  private readonly viewer: PDFViewer;
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private openRequest = 0;
  private uiManager: EditorUIManager | null = null;
  private doc: PDFDocumentProxy | null = null;
  private state: ViewerState = INITIAL_STATE;
  private findState: FindState = INITIAL_FIND;
  private readonly listeners = new Set<() => void>();
  private scaleBeforePresenting = "auto";
  private lastFind: FindOptions | null = null;

  constructor(container: HTMLDivElement, viewerElement: HTMLDivElement) {
    this.container = container;
    const eventBus = this.eventBus;
    this.linkService = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK });
    this.findController = new PDFFindController({
      eventBus,
      linkService: this.linkService,
      updateMatchesCountOnProgress: true,
    });
    this.viewer = new PDFViewer({
      container,
      viewer: viewerElement,
      eventBus,
      linkService: this.linkService,
      findController: this.findController,
      // No language: use the English strings bundled with PDF.js (nothing is fetched).
      l10n: new GenericL10n(undefined as unknown as string),
      annotationMode: AnnotationMode.ENABLE_FORMS,
      annotationEditorMode: AnnotationEditorType.NONE,
      annotationEditorHighlightColors: Object.entries(HIGHLIGHT_COLORS)
        .map(([name, value]) => `${name}=${value}`)
        .join(","),
      imageResourcesPath: "",
      supportsPinchToZoom: true,
    });
    this.linkService.setViewer(this.viewer);

    eventBus.on("pagesinit", () => {
      this.viewer.currentScaleValue = "auto";
      this.patch({ pageCount: this.viewer.pagesCount, page: this.viewer.currentPageNumber });
    });
    eventBus.on("pagechanging", (evt: { pageNumber: number }) => this.patch({ page: evt.pageNumber }));
    eventBus.on("scalechanging", (evt: { scale: number; presetValue?: string }) =>
      this.patch({ scale: evt.scale, scaleValue: evt.presetValue ?? String(evt.scale) }),
    );
    eventBus.on("rotationchanging", (evt: { pagesRotation: number }) =>
      this.patch({ rotation: evt.pagesRotation }),
    );
    eventBus.on("spreadmodechanged", (evt: { mode: number }) =>
      this.patch({ twoPages: evt.mode !== SpreadMode.NONE }),
    );
    eventBus.on("annotationeditoruimanager", (evt: { uiManager: EditorUIManager }) => {
      this.uiManager = evt.uiManager;
    });
    eventBus.on("annotationeditormodechanged", (evt: { mode: number }) => {
      const tool = (Object.keys(TOOL_TO_MODE) as EditorTool[]).find((k) => TOOL_TO_MODE[k] === evt.mode);
      this.patch({ tool: tool ?? "none" });
    });
    eventBus.on(
      "editingstateschanged",
      (evt: { details: { hasSomethingToUndo: boolean; hasSomethingToRedo: boolean; hasSelectedEditor: boolean } }) =>
        this.patch({
          canUndo: evt.details.hasSomethingToUndo,
          canRedo: evt.details.hasSomethingToRedo,
          hasSelectedEditor: evt.details.hasSelectedEditor,
        }),
    );
    eventBus.on("updatefindmatchescount", (evt: { matchesCount: { current: number; total: number } }) =>
      this.patchFind({ current: evt.matchesCount.current, total: evt.matchesCount.total }),
    );
    eventBus.on(
      "updatefindcontrolstate",
      (evt: { state: number; matchesCount: { current: number; total: number } }) =>
        this.patchFind({
          current: evt.matchesCount.current,
          total: evt.matchesCount.total,
          notFound: evt.state === 1,
          pending: evt.state === 3,
        }),
    );

    new ResizeObserver(() => this.handleResize()).observe(container);
  }

  // --- state subscription (useSyncExternalStore compatible) ---
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;
  getFindState = () => this.findState;

  private patch(partial: Partial<ViewerState>) {
    const next = { ...this.state, ...partial };
    if ((Object.keys(partial) as (keyof ViewerState)[]).every((k) => this.state[k] === next[k])) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  private patchFind(partial: Partial<FindState>) {
    this.findState = { ...this.findState, ...partial };
    this.listeners.forEach((l) => l());
  }

  get document() {
    return this.doc;
  }

  // --- document lifecycle ---
  async open(data: Uint8Array, askPassword: PasswordPrompt): Promise<void> {
    // Reserve the request before waiting for the previous worker to stop.
    const request = ++this.openRequest;
    await this.closeDocument();
    if (request !== this.openRequest) throw new OpenCancelled();
    const task = getDocument({
      data,
      cMapUrl: assetUrl("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: assetUrl("standard_fonts"),
      wasmUrl: assetUrl("wasm"),
      iccUrl: assetUrl("iccs"),
    });
    this.loadingTask = task;
    task.onPassword = (update: (password: string | Error) => void, reason: number) => {
      void askPassword(reason === PasswordResponses.INCORRECT_PASSWORD).then((password) => {
        update(password ?? new PasswordCancelled("Password prompt cancelled"));
      });
    };
    let doc: PDFDocumentProxy;
    try {
      doc = await task.promise;
    } catch (error) {
      if (this.loadingTask === task) this.loadingTask = null;
      await task.destroy().catch(() => undefined);
      if (request !== this.openRequest) throw new OpenCancelled();
      throw error;
    }
    if (request !== this.openRequest) {
      await task.destroy().catch(() => undefined);
      throw new OpenCancelled();
    }
    this.doc = doc;
    const storage = doc.annotationStorage as unknown as {
      onSetModified: (() => void) | null;
    };
    // PDF.js clears its own flag whenever the bytes are generated; ours is only cleared by
    // markSaved(), i.e. once the file was really written (the user may cancel the save dialog).
    storage.onSetModified = () => this.patch({ modified: true });
    this.viewer.setDocument(doc);
    this.linkService.setDocument(doc, null);
    this.patch({ ...INITIAL_STATE, hasDocument: true, pageCount: doc.numPages });
    this.findState = INITIAL_FIND;
  }

  async close(): Promise<void> {
    ++this.openRequest;
    await this.closeDocument();
  }

  private async closeDocument(): Promise<void> {
    const task = this.loadingTask;
    this.loadingTask = null;
    this.uiManager = null;
    this.lastFind = null;
    if (this.doc) {
      this.viewer.setDocument(null as unknown as PDFDocumentProxy);
      this.linkService.setDocument(null, null);
      this.doc = null;
    }
    this.findState = INITIAL_FIND;
    this.patch({ ...INITIAL_STATE });
    if (task) await task.destroy().catch(() => undefined);
  }

  /** Returns the document bytes, including any annotations added by the user. */
  async getBytes(): Promise<Uint8Array> {
    const doc = this.requireDoc();
    this.commitEdits();
    return doc.annotationStorage.size > 0 ? doc.saveDocument() : doc.getData();
  }

  /** Captures the exact document and annotation contents being written. */
  async prepareSave(): Promise<SaveSnapshot> {
    const doc = this.requireDoc();
    this.commitEdits();
    // PDF.js only emits onSetModified on its first change, so a boolean or
    // event counter cannot detect subsequent edits during serialization.
    const annotationHash = doc.annotationStorage.serializable.hash;
    const data = await (doc.annotationStorage.size > 0 ? doc.saveDocument() : doc.getData());
    return { document: doc, annotationHash, data };
  }

  /**
   * Finishes any stroke or text box that is still being edited so it reaches the
   * document's annotation storage (needed before saving, printing or closing).
   */
  commitEdits() {
    try {
      this.uiManager?.currentLayer?.endDrawingSession(false);
      this.uiManager?.commitOrRemove();
    } catch (error) {
      console.warn("Could not commit the active annotation", error);
    }
  }

  hasUnsavedChanges(): boolean {
    this.commitEdits();
    return this.state.modified;
  }

  markSaved(snapshot: SaveSnapshot): boolean {
    if (this.doc !== snapshot.document) return false;
    this.commitEdits();
    if (this.doc.annotationStorage.serializable.hash !== snapshot.annotationHash) {
      this.patch({ modified: true });
      return false;
    }
    this.doc.annotationStorage.resetModified();
    this.patch({ modified: false });
    return true;
  }

  private requireDoc(): PDFDocumentProxy {
    if (!this.doc) throw new Error("No document is open");
    return this.doc;
  }

  // --- navigation ---
  goToPage(page: number) {
    if (!this.doc) return;
    this.viewer.currentPageNumber = Math.min(Math.max(1, Math.round(page)), this.viewer.pagesCount);
  }
  nextPage() {
    this.viewer.nextPage();
  }
  previousPage() {
    this.viewer.previousPage();
  }
  goToDestination(dest: string | unknown[]) {
    void this.linkService.goToDestination(dest as string | never[]);
  }
  focus() {
    this.container.focus({ preventScroll: true });
  }

  // --- zoom / layout ---
  zoomIn(origin?: [number, number]) {
    if (this.doc) this.viewer.updateScale({ steps: 1, origin, drawingDelay: origin ? 300 : 0 });
  }
  zoomOut(origin?: [number, number]) {
    if (this.doc) this.viewer.updateScale({ steps: -1, origin, drawingDelay: origin ? 300 : 0 });
  }
  setScalePercent(percent: number) {
    if (!this.doc || !Number.isFinite(percent)) return;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, percent / 100));
    this.viewer.currentScaleValue = String(scale);
  }
  setFit(mode: FitMode | "auto" | "page-actual") {
    if (this.doc) this.viewer.currentScaleValue = mode;
  }
  rotate(delta: 90 | -90) {
    if (this.doc) this.viewer.pagesRotation = (this.viewer.pagesRotation + delta + 360) % 360;
  }
  setTwoPages(enabled: boolean) {
    if (!this.doc) return;
    this.viewer.spreadMode = enabled ? SpreadMode.ODD : SpreadMode.NONE;
    this.handleResize();
  }

  private handleResize() {
    if (!this.doc) return;
    const value = this.viewer.currentScaleValue;
    if (value === "auto" || value === "page-fit" || value === "page-width") {
      this.viewer.currentScaleValue = value;
    }
    this.viewer.update();
  }

  setPresenting(enabled: boolean) {
    if (!this.doc || enabled === this.state.presenting) {
      if (!enabled) this.patch({ presenting: false });
      return;
    }
    if (enabled) {
      this.setTool("none");
      this.scaleBeforePresenting = this.viewer.currentScaleValue;
      this.viewer.scrollMode = ScrollMode.PAGE;
      this.viewer.currentScaleValue = "page-fit";
    } else {
      this.viewer.scrollMode = ScrollMode.VERTICAL;
      this.viewer.currentScaleValue = this.scaleBeforePresenting;
    }
    this.patch({ presenting: enabled });
  }

  // --- annotation editing ---
  setTool(tool: EditorTool) {
    if (!this.doc || !this.uiManager) return;
    this.viewer.annotationEditorMode = { mode: TOOL_TO_MODE[tool] };
  }
  setInkStyle(style: { color?: string; thickness?: number; opacity?: number }) {
    const m = this.uiManager;
    if (!m) return;
    if (style.color !== undefined) m.updateParams(AnnotationEditorParamsType.INK_COLOR, style.color);
    if (style.thickness !== undefined) m.updateParams(AnnotationEditorParamsType.INK_THICKNESS, style.thickness);
    if (style.opacity !== undefined) m.updateParams(AnnotationEditorParamsType.INK_OPACITY, style.opacity);
  }
  setTextStyle(style: { color?: string; size?: number }) {
    const m = this.uiManager;
    if (!m) return;
    if (style.color !== undefined) m.updateParams(AnnotationEditorParamsType.FREETEXT_COLOR, style.color);
    if (style.size !== undefined) m.updateParams(AnnotationEditorParamsType.FREETEXT_SIZE, style.size);
  }
  setHighlightColor(color: string) {
    this.uiManager?.updateParams(AnnotationEditorParamsType.HIGHLIGHT_COLOR, color);
  }
  undo() {
    this.uiManager?.undo();
  }
  redo() {
    this.uiManager?.redo();
  }
  deleteSelected() {
    this.uiManager?.delete();
  }

  // --- find ---
  find(options: FindOptions, direction: "new" | "next" | "previous" = "new") {
    if (!this.doc) return;
    const sameQuery =
      this.lastFind?.query === options.query &&
      this.lastFind.caseSensitive === options.caseSensitive &&
      this.lastFind.entireWord === options.entireWord;
    this.lastFind = options;
    this.eventBus.dispatch("find", {
      source: this,
      type: direction === "new" || !sameQuery ? "" : "again",
      query: options.query,
      caseSensitive: options.caseSensitive,
      entireWord: options.entireWord,
      highlightAll: true,
      findPrevious: direction === "previous",
      matchDiacritics: false,
    });
    if (!options.query) this.findState = INITIAL_FIND;
  }
  closeFind() {
    this.lastFind = null;
    this.eventBus.dispatch("findbarclose", { source: this });
    this.patchFind(INITIAL_FIND);
  }
}
