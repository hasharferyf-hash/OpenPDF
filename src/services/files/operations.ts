/** Serializes file dialogs and document operations, including native drop events. */
export class FileOperations {
  private active = false;
  private readonly listeners = new Set<() => void>();

  get busy() {
    return this.active;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish() {
    this.listeners.forEach((listener) => listener());
  }

  async run(operation: () => Promise<void>): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.publish();
    try {
      await operation();
    } finally {
      this.active = false;
      this.publish();
    }
  }
}
