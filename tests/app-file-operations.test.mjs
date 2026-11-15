import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./load-module.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const pdf = (name) => ({ name, data: new Uint8Array([1]) });

async function app(picker = async () => [pdf("one.pdf")]) {
  const hooks = [], effects = [], calls = [], handles = new Map(), events = new Map();
  const { FileOperations } = await loadModule("src/services/files/operations.ts");
  const { DocumentTabs } = await loadModule("src/services/tabs.ts");
  let cursor = 0, tree, subscribed = false, scheduled = false;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (value) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
  };
  const useRef = (initial) => {
    const index = cursor++;
    hooks[index] ??= { current: initial };
    return hooks[index];
  };
  const element = (type, props) => ({ type, props });
  const findAll = (type, node) => {
    if (!node || typeof node !== "object") return [];
    const children = node.props?.children;
    return [...(node.type === type ? [node] : []), ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap((child) => findAll(type, child))];
  };
  const render = () => {
    cursor = 0;
    tree = module.default();
    for (const view of findAll("DocumentView", tree)) {
      const { id, onReady, onStatus } = view.props;
      if (handles.has(id)) continue;
      const handle = {
        name: null, dirty: false, presenting: false, allowClose: true,
        async load(file) {
          calls.push(["load", id, file.name]); this.name = file.name;
          onStatus(id, { name: this.name, modified: this.dirty, presenting: this.presenting, modal: false });
        },
        hasUnsavedChanges() { return this.dirty; },
        async confirmClose() { calls.push(["confirm", id]); return this.allowClose; },
        async exitPresentation() { calls.push(["exitPresentation", id]); this.presenting = false; },
        async destroy() { calls.push(["destroy", id]); },
      };
      handles.set(id, handle);
      onReady(id, handle);
    }
  };
  const module = await loadModule("src/App.tsx", {
    react: {
      useState, useRef, useCallback: (fn) => fn, useMemo: (fn) => fn(),
      useEffect: (fn) => effects.push(fn),
      useSyncExternalStore(subscribe, snapshot) {
        if (!subscribed) {
          subscribed = true;
          subscribe(() => {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => { scheduled = false; render(); });
          });
        }
        return snapshot();
      },
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "./components/DocumentView": { DocumentView: "DocumentView" },
    "./components/TabStrip": { TabStrip: "TabStrip" },
    "./components/Dialogs": { MessageDialog: "MessageDialog" },
    "./i18n": { I18nContext: { Provider: "Provider" }, initialLanguage: () => "en", storeLanguage() {}, translator: () => (key) => key },
    "./services/files/operations": { FileOperations },
    "./services/tabs": { DocumentTabs },
    "./services/files/platform": {
      fromFile: async (file) => file, isDesktop: false, isPdfName: (name) => name.endsWith(".pdf"),
      onNativeFileDrop: async () => () => {}, pickPdfs: picker, readPath() {}, startupFilePath: async () => null,
    },
  }, { window: {
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name) => events.delete(name),
  } });
  render();
  // Mount the pending-open subscription and keyboard effect. The native startup
  // effect is intentionally not mounted in this unit test.
  effects[1]();
  effects[3]();
  const find = (type) => findAll(type, tree)[0];
  return { calls, handles, render, find, events, open: () => find("DocumentView").props.onOpen() };
}

test("opening multiple files creates independent tabs and reuses the initial blank", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf"), pdf("three.pdf")]);
  fixture.open(); await tick();
  const strip = fixture.find("TabStrip").props;
  assert.deepEqual(Array.from(strip.tabs, (tab) => tab.name), ["one.pdf", "two.pdf", "three.pdf"]);
  assert.equal(strip.activeId, strip.tabs[2].id);
  assert.equal(fixture.calls.filter(([name]) => name === "load").length, 3);
});

test("switching tabs preserves each document and its unsaved edits", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf")]);
  fixture.open(); await tick();
  const strip = fixture.find("TabStrip").props;
  const first = fixture.handles.get(strip.tabs[0].id);
  first.dirty = true;
  strip.onActivate(strip.tabs[0].id); await tick();
  assert.equal(fixture.find("TabStrip").props.activeId, strip.tabs[0].id);
  assert.equal(fixture.handles.get(strip.tabs[0].id), first);
  assert.equal(first.dirty, true);
  assert.equal(fixture.calls.some(([name]) => name === "destroy"), false);
});

test("a pending picker excludes duplicate open actions and cancellation leaves tabs intact", async () => {
  let resolve, picks = 0;
  const fixture = await app(() => { picks++; return new Promise((done) => { resolve = done; }); });
  fixture.open(); fixture.open();
  assert.equal(picks, 1);
  resolve([]); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 1);
  assert.equal(fixture.calls.length, 0);
});

test("opening a new PDF keeps edits made to the existing document while selecting files", async () => {
  let resolve, picks = 0;
  const fixture = await app(() => ++picks === 1 ? Promise.resolve([pdf("one.pdf")]) : new Promise((done) => { resolve = done; }));
  fixture.open(); await tick();
  const firstId = fixture.find("TabStrip").props.activeId;
  fixture.open();
  fixture.handles.get(firstId).dirty = true;
  resolve([pdf("two.pdf")]); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 2);
  assert.equal(fixture.handles.get(firstId).dirty, true);
  assert.equal(fixture.calls.some(([name]) => name === "confirm" || name === "destroy"), false);
});

test("closing a dirty tab requires confirmation and cancellation preserves it", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf")]);
  fixture.open(); await tick();
  const strip = fixture.find("TabStrip").props;
  const id = strip.tabs[0].id;
  const handle = fixture.handles.get(id);
  handle.dirty = true; handle.allowClose = false;
  strip.onClose(id); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 2);
  assert.equal(fixture.find("TabStrip").props.activeId, id);
  assert.equal(fixture.calls.some(([name]) => name === "destroy"), false);
  handle.allowClose = true;
  fixture.find("TabStrip").props.onClose(id); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 1);
  assert.deepEqual(fixture.calls.filter(([name]) => name === "destroy"), [["destroy", id]]);
});

test("Ctrl+Tab selects the next document and Ctrl+W closes only the active one", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf")]);
  fixture.open(); await tick();
  const firstId = fixture.find("TabStrip").props.tabs[0].id;
  const key = (value) => fixture.events.get("keydown")({ key: value, ctrlKey: true, preventDefault() {}, stopPropagation() {} });
  key("Tab"); await tick();
  assert.equal(fixture.find("TabStrip").props.activeId, firstId);
  key("w"); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 1);
  assert.deepEqual(fixture.calls.filter(([name]) => name === "destroy"), [["destroy", firstId]]);
});

test("closing the last tab leaves a new empty tab", async () => {
  const fixture = await app();
  fixture.open(); await tick();
  const id = fixture.find("TabStrip").props.activeId;
  fixture.find("TabStrip").props.onClose(id); await tick();
  const { tabs, activeId } = fixture.find("TabStrip").props;
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].name, null);
  assert.notEqual(activeId, id);
});
