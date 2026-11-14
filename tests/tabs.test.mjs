import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./load-module.mjs";

test("cancelling application exit preserves every tab and checks background documents", async () => {
  const { DocumentTabs } = await loadModule("src/services/tabs.ts");
  const documents = new DocumentTabs();
  const first = documents.active;
  const second = documents.create();
  const third = documents.create();
  const confirmations = [];
  const handle = (id, dirty, allow) => ({
    hasUnsavedChanges: () => dirty,
    async confirmClose() { confirmations.push(id); return allow; },
    async exitPresentation() {},
    async destroy() { throw new Error("exit confirmation must not remove any document"); },
  });
  documents.register(first.id, handle(first.id, true, true));
  documents.register(second.id, handle(second.id, true, false));
  documents.register(third.id, handle(third.id, false, true));
  assert.equal(await documents.confirmAll(), false);
  assert.deepEqual(confirmations, [first.id, second.id]);
  assert.equal(documents.getSnapshot().tabs.length, 3);
  assert.equal(documents.active.id, second.id);
});

test("uncommitted edits are checked through every live controller before browser exit", async () => {
  const { DocumentTabs } = await loadModule("src/services/tabs.ts");
  const documents = new DocumentTabs();
  const first = documents.active;
  const second = documents.create();
  const checked = [];
  documents.register(first.id, { hasUnsavedChanges() { checked.push(first.id); return true; } });
  documents.register(second.id, { hasUnsavedChanges() { checked.push(second.id); return false; } });
  assert.equal(documents.hasUnsavedChanges(), true);
  assert.deepEqual(checked, [first.id, second.id]);
  documents.remove(first.id);
  assert.equal(documents.hasUnsavedChanges(), false);
});

test("tab keyboard navigation wraps and selects the nearest tab after removal", async () => {
  const { DocumentTabs } = await loadModule("src/services/tabs.ts");
  const documents = new DocumentTabs();
  const first = documents.active;
  const second = documents.create();
  const third = documents.create();
  assert.equal(documents.adjacent(1), first.id);
  documents.activate(first.id);
  assert.equal(documents.adjacent(-1), third.id);
  documents.activate(second.id);
  documents.remove(second.id);
  assert.equal(documents.active.id, third.id);
  documents.remove(first.id);
  assert.equal(documents.active.id, third.id);
});

test("closing all clean documents needs no discard prompts", async () => {
  const { DocumentTabs } = await loadModule("src/services/tabs.ts");
  const documents = new DocumentTabs();
  documents.register(documents.active.id, {
    hasUnsavedChanges: () => false,
    async confirmClose() { throw new Error("clean document should not prompt"); },
  });
  assert.equal(await documents.confirmAll(), true);
});
