import { invoke } from "@tauri-apps/api/core";

export interface NativePrintDocument {
  title: string;
  pageCount: number;
  currentPage: number;
}

/** Ask Windows for settings before serializing the PDF or preparing any pages. */
export async function printWithWindows(
  document: NativePrintDocument,
  getBytes: () => Promise<Uint8Array>,
  signal: AbortSignal,
  onAccepted: () => void,
): Promise<void> {
  const id = await invoke<number | null>("choose_native_print", { ...document });
  if (id === null) return;
  const cancel = () => invoke("cancel_native_print", { id }).catch(console.error);
  let complete = false;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) return;
    onAccepted();
    const bytes = await getBytes();
    if (signal.aborted) return;
    await invoke("submit_native_print", bytes, { headers: { "x-print-job": String(id) } });
    complete = true;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) await cancel();
  }
}
