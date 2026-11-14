// Local file access. In the desktop app this goes through Tauri (native dialogs
// and two narrow Rust commands); in a plain browser (used during development)
// it falls back to a file input and a blob download.
import { invoke } from "@tauri-apps/api/core";

export interface OpenedFile {
  name: string;
  /** Absolute path, only known in the desktop app. */
  path?: string;
  data: Uint8Array;
}

export const isDesktop = "__TAURI_INTERNALS__" in window;

const PDF_FILTER = [{ name: "PDF", extensions: ["pdf"] }];

export const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

export const isPdfName = (name: string) => name.toLowerCase().endsWith(".pdf");

export async function readPath(path: string): Promise<OpenedFile> {
  const buffer = await invoke<ArrayBuffer>("read_pdf", { path });
  return { name: baseName(path), path, data: new Uint8Array(buffer) };
}

function pickWithInput(multiple = false): Promise<OpenedFile[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.multiple = multiple;
    input.onchange = async () => {
      try {
        resolve(await Promise.all(Array.from(input.files ?? []).map(fromFile)));
      } catch (error) { reject(error); }
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function fromFile(file: File): Promise<OpenedFile> {
  return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
}

export async function pickPdf(): Promise<OpenedFile | null> {
  if (!isDesktop) return (await pickWithInput())[0] ?? null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, directory: false, filters: PDF_FILTER });
  return typeof path === "string" ? readPath(path) : null;
}

export async function pickPdfs(): Promise<OpenedFile[]> {
  if (!isDesktop) return pickWithInput(true);
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ multiple: true, directory: false, filters: PDF_FILTER });
  const paths = typeof selected === "string" ? [selected] : selected ?? [];
  return Promise.all(paths.map(readPath));
}

/** Asks where to save and writes the bytes. Resolves to the saved path/name, or null if cancelled. */
export async function savePdf(suggestedPath: string, data: Uint8Array): Promise<string | null> {
  if (!isDesktop) {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = baseName(suggestedPath);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return link.download;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  let path = await save({ defaultPath: suggestedPath, filters: PDF_FILTER });
  if (!path) return null;
  if (!isPdfName(path)) path += ".pdf";
  await invoke("write_pdf", data, { headers: { "x-path": encodeURIComponent(path) } });
  return path;
}

/** The PDF passed on the command line (e.g. via "Open with"), if any. */
export async function startupFilePath(): Promise<string | null> {
  if (!isDesktop) return null;
  return invoke<string | null>("startup_file");
}

export async function setWindowTitle(title: string): Promise<void> {
  document.title = title;
  if (!isDesktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

export async function setFullscreen(enabled: boolean): Promise<void> {
  if (isDesktop) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(enabled);
  } else if (enabled) {
    await document.documentElement.requestFullscreen().catch(() => undefined);
  } else if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
  }
}

export async function openExternal(url: string): Promise<void> {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  if (isDesktop) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Subscribes to files dropped on the window (desktop only; the browser uses DOM events). */
export async function onNativeFileDrop(handlers: {
  onHover(active: boolean): void;
  onDrop(paths: string[]): void;
}): Promise<() => void> {
  if (!isDesktop) return () => undefined;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "enter" || payload.type === "over") handlers.onHover(true);
    else if (payload.type === "leave") handlers.onHover(false);
    else if (payload.type === "drop") {
      handlers.onHover(false);
      handlers.onDrop(payload.paths);
    }
  });
}
