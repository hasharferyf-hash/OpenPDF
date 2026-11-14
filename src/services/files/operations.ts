/** Serializes file dialogs and document operations, including native drop events. */
export class FileOperations {
  private active = false;

  get busy() {
    return this.active;
  }

  async run(operation: () => Promise<void>): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      await operation();
    } finally {
      this.active = false;
    }
  }
}
