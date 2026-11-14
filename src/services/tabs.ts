import type { OpenedFile } from "./files/platform";

export interface DocumentHandle {
  load(file: OpenedFile): Promise<void>;
  hasUnsavedChanges(): boolean;
  confirmClose(): Promise<boolean>;
  exitPresentation(): Promise<void>;
  destroy(): Promise<void>;
}

export interface DocumentStatus {
  name: string | null;
  modified: boolean;
  presenting: boolean;
  modal: boolean;
}

export interface DocumentTab extends DocumentStatus {
  readonly id: number;
  readonly ready: Promise<DocumentHandle>;
}

/** Owns tab identity and selection; document state stays with its mounted view. */
export class DocumentTabs {
  private nextId = 0;
  private readonly listeners = new Set<() => void>();
  private readonly registrations = new Map<number, (handle: DocumentHandle) => void>();
  private readonly handles = new Map<number, DocumentHandle>();
  private snapshot: { tabs: readonly DocumentTab[]; activeId: number };

  constructor() {
    const tab = this.makeTab();
    this.snapshot = { tabs: [tab], activeId: tab.id };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  private makeTab(): DocumentTab {
    const id = ++this.nextId;
    const ready = new Promise<DocumentHandle>((resolve) => this.registrations.set(id, resolve));
    return { id, ready, name: null, modified: false, presenting: false, modal: false };
  }

  private publish(tabs: readonly DocumentTab[], activeId: number) {
    this.snapshot = { tabs, activeId };
    this.listeners.forEach((listener) => listener());
  }

  register(id: number, handle: DocumentHandle) {
    if (!this.snapshot.tabs.some((tab) => tab.id === id)) {
      void handle.destroy();
      return;
    }
    this.registrations.get(id)?.(handle);
    this.handles.set(id, handle);
    this.registrations.delete(id);
  }

  update(id: number, status: DocumentStatus) {
    const current = this.snapshot.tabs.find((tab) => tab.id === id);
    if (!current || Object.entries(status).every(([key, value]) => current[key as keyof DocumentStatus] === value)) return;
    this.publish(this.snapshot.tabs.map((tab) => tab.id === id ? { ...tab, ...status } : tab), this.snapshot.activeId);
  }

  create(): DocumentTab {
    const tab = this.makeTab();
    this.publish([...this.snapshot.tabs, tab], tab.id);
    return tab;
  }

  activate(id: number) {
    if (id !== this.snapshot.activeId && this.snapshot.tabs.some((tab) => tab.id === id)) {
      this.publish(this.snapshot.tabs, id);
    }
  }

  remove(id: number) {
    const { tabs, activeId } = this.snapshot;
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    this.registrations.delete(id);
    this.handles.delete(id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    if (!remaining.length) {
      const blank = this.makeTab();
      this.publish([blank], blank.id);
    } else {
      this.publish(remaining, activeId === id ? remaining[Math.min(index, remaining.length - 1)].id : activeId);
    }
  }

  get active(): DocumentTab {
    return this.snapshot.tabs.find((tab) => tab.id === this.snapshot.activeId)!;
  }

  adjacent(direction: 1 | -1): number {
    const { tabs, activeId } = this.snapshot;
    const index = tabs.findIndex((tab) => tab.id === activeId);
    return tabs[(index + direction + tabs.length) % tabs.length].id;
  }

  hasUnsavedChanges(): boolean {
    // Read the controllers, not just the tab badges: active text or ink may
    // need committing before its modified event has reached React.
    let modified = false;
    for (const handle of this.handles.values()) modified = handle.hasUnsavedChanges() || modified;
    return modified;
  }

  async confirmAll(): Promise<boolean> {
    for (const tab of this.snapshot.tabs) {
      const handle = await tab.ready;
      if (!handle.hasUnsavedChanges()) continue;
      await this.active.ready.then((active) => active.exitPresentation());
      this.activate(tab.id);
      if (!(await handle.confirmClose())) return false;
    }
    return true;
  }
}
